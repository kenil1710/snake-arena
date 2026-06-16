/**
 * Client-side "entries used" hint, keyed by (wallet, tournamentId).
 *
 * The contract knows how many entries a wallet bought; only the game server
 * knows which have been played. This localStorage counter approximates the
 * latter in the browser — incremented once per game start — so the lobby can
 * tell whether tapping "Play" should jump straight into a run or open the
 * entry flow for a fresh attempt. It is a UX hint only; the server stays
 * authoritative about which entry tx is still unused.
 */

const keyFor = (wallet: string, tournamentId: string) =>
  `sa:entriesUsed:${wallet.toLowerCase()}:${tournamentId}`;

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

/** Count one more started game; called when a session begins. */
export function markEntryUsed(wallet: string, tournamentId: string | number): void {
  try {
    const id = String(tournamentId);
    localStorage.setItem(keyFor(wallet, id), String(entriesUsed(wallet, id) + 1));
  } catch {
    // Storage disabled — the hint just stays approximate.
  }
}

/** True when the wallet has bought more entries than it has started playing. */
export function hasUnplayedEntry(
  wallet: string | undefined,
  tournamentId: string | number,
  entryCount: bigint | undefined,
): boolean {
  if (!wallet || entryCount === undefined) return false;
  return Number(entryCount) > entriesUsed(wallet, tournamentId);
}
