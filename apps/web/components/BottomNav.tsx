'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Play, User } from 'lucide-react';

const LAST_TOURNAMENT_KEY = 'sa:lastTournament';

/** One nav slot: icon + label, brightening when active, with a little dot. */
function NavItem({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex w-16 flex-col items-center gap-1 py-1 transition-colors ${
        active ? 'text-accent-bright' : 'text-muted hover:text-secondary'
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
      <span
        aria-hidden
        className={`h-1 w-1 rounded-full ${active ? 'bg-accent-bright' : 'bg-transparent'}`}
      />
    </Link>
  );
}

/**
 * Mobile-only floating nav (<md). A garden-surface pill with Lobby / Play /
 * Profile; the center Play is a raised gold coin that pops above the bar and
 * jumps straight back into the player's most recent tournament (else lobby).
 * Hidden on the immersive game screen, which owns its own bottom controls.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [lastTournament, setLastTournament] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLastTournament(window.localStorage.getItem(LAST_TOURNAMENT_KEY));
    } catch {
      /* storage disabled — fall back to lobby */
    }
  }, [pathname]);

  if (pathname.startsWith('/play')) return null;

  const playHref = lastTournament ? `/play/${lastTournament}` : '/';
  const isLobby = pathname === '/';
  const isProfile = pathname.startsWith('/profile');

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden"
    >
      <div className="flex w-[90%] max-w-sm items-end justify-between rounded-full border border-edge-bright/30 bg-surface/95 px-6 py-2 shadow-[0_8px_30px_rgba(3,18,15,0.6)] backdrop-blur-xl">
        <NavItem href="/" label="Lobby" active={isLobby} icon={<Home size={20} />} />

        {/* Center: raised gold coin */}
        <Link
          href={playHref}
          aria-label="Play"
          className="group flex flex-col items-center gap-1"
        >
          <span className="btn-sheen -mt-7 flex h-14 w-14 items-center justify-center rounded-full text-coin-text shadow-[0_8px_22px_rgba(239,159,39,0.5)] ring-4 ring-background transition-transform group-active:scale-95">
            <Play size={24} fill="currentColor" aria-hidden />
          </span>
          <span className="text-[10px] font-semibold text-coin-light">Play</span>
        </Link>

        <NavItem href="/profile" label="Profile" active={isProfile} icon={<User size={20} />} />
      </div>
    </nav>
  );
}
