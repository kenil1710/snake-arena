import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { GameClient } from '@/components/game/GameClient';

/**
 * Server component: validates the route param shape. The entry check
 * (entryCount > 0) happens client-side in GameClient — the wallet address only
 * exists in the browser, so the server cannot read the user's entry.
 */
export default function PlayPage({
  params,
  searchParams,
}: {
  params: { tournamentId: string };
  searchParams: { entryTx?: string };
}) {
  if (!/^\d{1,18}$/.test(params.tournamentId)) redirect('/');

  // Keying on the entry tx forces a fresh GameClient (and a fresh session)
  // whenever a new paid entry arrives — e.g. "Play again" navigates here with a
  // new ?entryTx while we're already on this route.
  return (
    <Suspense>
      <GameClient
        key={searchParams.entryTx ?? 'no-entry'}
        tournamentId={Number(params.tournamentId)}
      />
    </Suspense>
  );
}
