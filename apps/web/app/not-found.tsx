import Link from 'next/link';
import { Mascot } from '@/components/illustrations/Mascot';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 pb-24 text-center md:pb-12">
      <Mascot pose="dead" size={128} />
      <h1 className="font-display text-2xl font-bold tracking-tight">
        This part of the garden doesn’t exist
      </h1>
      <p className="text-sm text-secondary">The page you’re after wandered off into the weeds.</p>
      <Link
        href="/"
        className="btn-sheen font-display mt-1 flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-bold text-coin-text shadow-glow transition-shadow hover:shadow-[0_0_28px_rgba(239,159,39,0.5)]"
      >
        Back to lobby
      </Link>
    </main>
  );
}
