'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mascot } from './illustrations/Mascot';
import { WalletWidget } from './WalletWidget';

const NAV = [
  { href: '/', label: 'Lobby' },
  { href: '/profile', label: 'Profile' },
] as const;

/** Pulsing-dot network indicator — users always know which chain they're on. */
function NetworkChip({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent ${className}`}
    >
      <span className="animate-live-dot inline-flex h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
      Base Sepolia
    </span>
  );
}

/**
 * App header — logo + wordmark always visible; nav links and the network chip
 * appear at md+. On mobile the BottomNav owns navigation, so only the logo and
 * wallet remain up top.
 */
export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/"
            className="group relative flex items-center gap-2 font-display text-base font-bold tracking-tight"
          >
            <Mascot pose="mini" size={24} className="transition-transform duration-300 group-hover:-rotate-12" />
            <span className="relative">
              Snake<span className="text-accent">Arena</span>
              <span
                aria-hidden
                className="absolute -bottom-0.5 left-0 h-px w-7 bg-gradient-hero transition-all duration-300 group-hover:w-full"
              />
            </span>
          </Link>
          <NetworkChip className="hidden md:flex" />
          <nav className="hidden items-center gap-5 text-sm md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors hover:text-white ${
                  pathname === item.href ? 'font-medium text-white' : 'text-secondary'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <WalletWidget />
      </div>
    </header>
  );
}
