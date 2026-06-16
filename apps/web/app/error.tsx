'use client';

import Link from 'next/link';
import { Mascot } from '@/components/illustrations/Mascot';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 pb-24 text-center md:pb-12">
      <Mascot pose="dead" size={128} />
      <h1 className="font-display text-2xl font-bold tracking-tight">Something broke in the garden</h1>
      <p className="text-sm text-secondary">
        An unexpected error tripped us up. Try again, or head back to the lobby.
      </p>
      <div className="mt-1 flex gap-2.5">
        <button
          onClick={reset}
          className="btn-sheen font-display flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-bold text-coin-text shadow-glow transition-shadow hover:shadow-[0_0_28px_rgba(239,159,39,0.5)]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="font-display flex min-h-12 items-center justify-center rounded-full border border-edge px-6 text-sm font-semibold text-secondary transition-colors hover:border-accent/50 hover:text-white"
        >
          Back to lobby
        </Link>
      </div>
    </main>
  );
}
