/**
 * Client-side "entries used" hint, keyed by (wallet, tournamentId).
 *
 * The contract knows how many entries a wallet bought; only the game server
 * knows which have been played. This localStorage counter approximates the
 * latter in the browser — incremented once per game start, the moment
 * /api/session/start succeeds — so the lobby and leaderboard can tell whether
 * tapping "Play" should jump straight into a run or open the entry flow for a
 * fresh attempt. It is a UX hint only; the server stays authoritative about
 * which entry tx is still unused.
 *
 * Important: the counter must be bumped on session start, NOT on entry-tx
 * confirmation or play-page mount. Bumping too early loses a paid-but-unplayed
 * entry (it appears used before its game ever ran).
 */

const KEY_PREFIX = 'sa:entriesUsed:';
/**
 * Bumped to v2 to discard counters written by the pre-fix build, which
 * incremented on entry-tx confirmation. Stale v1 values are ignored (every
 * wallet starts fresh under the v2 namespace) and cleared by migrateEntriesUsed.
 */
const KEY_VERSION = 'v2';
const VERSIONED_PREFIX = `${KEY_PREFIX}${KEY_VERSION}:`;
const MIGRATION_FLAG = 'sa:entriesUsedMigratedV2';

const keyFor = (wallet: string, tournamentId: string) =>
  `${VERSIONED_PREFIX}${wallet.toLowerCase()}:${tournamentId}`;

/** Games this wallet has started in the tournament, per local tracking. */
export function entriesUsed(wallet: string, tournamentId: string | number): number {
  try {
    const raw = localStorage.getItem(keyFor(wallet, String(tournamentId)));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Count one more started game. Call this exactly once, when a real game session
 * has begun (i.e. /api/session/start succeeded) — never on entry-tx
 * confirmation or page mount.
 */
export function markEntryUsed(wallet: string, tournamentId: string | number): void {
  try {
    const id = String(tournamentId);
    localStorage.setItem(keyFor(wallet, id), String(entriesUsed(wallet, id) + 1));
  } catch {
    // Storage disabled — the hint just stays approximate.
  }
}

// Dev-only: the all-entries-used warning is evaluated on every render that calls
// hasUnplayedEntry, so dedupe by (wallet, tournament, counts) to avoid flooding.
const warnedAllUsed = new Set<string>();

/** True when the wallet has bought more entries than it has started playing. */
export function hasUnplayedEntry(
  wallet: string | undefined,
  tournamentId: string | number,
  entryCount: bigint | undefined,
): boolean {
  if (!wallet || entryCount === undefined) return false;
  const count = Number(entryCount);
  const used = entriesUsed(wallet, tournamentId);
  const unplayed = count > used;

  // Surfaces the exact regression this counter is prone to: a wallet that paid
  // for entries but is being told it has none left to play.
  if (process.env.NODE_ENV !== 'production' && !unplayed && count > 0) {
    const dedupeKey = `${wallet.toLowerCase()}:${tournamentId}:${count}:${used}`;
    if (!warnedAllUsed.has(dedupeKey)) {
      warnedAllUsed.add(dedupeKey);
      console.warn(
        '[entriesUsed] All entries marked used for tournament',
        tournamentId,
        '— entryCount:',
        count,
        'used:',
        used,
      );
    }
  }

  return unplayed;
}

/**
 * One-time boot migration. The pre-fix build incremented the used-counter when
 * the entry tx confirmed, so a paid entry whose game never started could be
 * stuck showing no "Play" button. The v2 key namespace already makes stale
 * counters start fresh; this also clears the orphaned v1 keys and logs once, so
 * anyone affected is visibly unstuck. The server remains authoritative, so a
 * reset counter can never let a genuinely-used entry be played twice.
 */
export function migrateEntriesUsed(): void {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key === MIGRATION_FLAG) continue;
      // Legacy v1 counters look like `sa:entriesUsed:<wallet>:<id>` — the prefix
      // without the version segment. Leave v2 keys untouched.
      if (key.startsWith(KEY_PREFIX) && !key.startsWith(VERSIONED_PREFIX)) {
        stale.push(key);
      }
    }
    for (const key of stale) localStorage.removeItem(key);
    localStorage.setItem(MIGRATION_FLAG, '1');
    console.info(
      `[entriesUsed] v2 migration: cleared ${stale.length} legacy counter(s); unplayed entries are playable again.`,
    );
  } catch {
    // Storage disabled — nothing to migrate.
  }
}
