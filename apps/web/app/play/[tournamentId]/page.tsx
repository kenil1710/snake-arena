import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { GameClient } from '@/components/game/GameClient';

/**
 * Server component: validates the route param shape. The entry check
 * (entryCount > 0) happens client-side in GameClient — the wallet address only
 * exists in the browser, so the server cannot read the user's entry.
 */
export default function PlayPage({ params }: { params: { tournamentId: string } }) {
  if (!/^\d{1,18}$/.test(params.tournamentId)) redirect('/');

  return (
    <Suspense>
      <GameClient tournamentId={Number(params.tournamentId)} />
    </Suspense>
  );
}
