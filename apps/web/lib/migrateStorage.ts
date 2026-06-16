/**
 * One-time client storage cleanup for the move to the simple-entry model.
 *
 * Earlier builds tracked "which entries were played" in localStorage
 * (sa:entriesUsed:*, the v2 migration flag) plus per-tournament entry-tx hints
 * in sessionStorage (snakearena:entryTx:*). The frontend no longer tracks any
 * of that — every play is a fresh paid entry — so these keys are removed once
 * on boot to unstick anyone left in the old state.
 */

const MIGRATION_FLAG = 'sa:simpleEntryMigrated';

export function migrateToSimpleEntryModel(): void {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;

    // localStorage: drop the old "entries used" counters / flags and any legacy
    // lastEntry key. The event-log and block-time caches are left intact.
    const staleLocal: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.includes('entriesUsed') || key === 'snakearena:lastEntry') staleLocal.push(key);
    }
    staleLocal.forEach((key) => localStorage.removeItem(key));

    // sessionStorage: drop legacy per-tournament entry-tx hints.
    try {
      const staleSession: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('snakearena:entryTx:')) staleSession.push(key);
      }
      staleSession.forEach((key) => sessionStorage.removeItem(key));
    } catch {
      // sessionStorage unavailable — ignore.
    }

    localStorage.setItem(MIGRATION_FLAG, '1');
    console.info('Migrated to simple-entry model');
  } catch {
    // Storage disabled — nothing to migrate.
  }
}
