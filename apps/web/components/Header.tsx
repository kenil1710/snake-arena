'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { SnakeLogo } from './illustrations/SnakeLogo';
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

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3 sm:gap-5">
          <Link href="/" className="group relative flex items-center gap-2 text-base font-bold tracking-tight">
            <SnakeLogo size={22} className="transition-transform duration-300 group-hover:-rotate-12" />
            <span className="relative">
              Snake<span className="text-accent">Arena</span>
              <span
                aria-hidden
                className="absolute -bottom-0.5 left-0 h-px w-7 bg-gradient-hero transition-all duration-300 group-hover:w-full"
              />
            </span>
          </Link>
          <NetworkChip className="hidden md:flex" />
          <nav className="hidden items-center gap-5 text-sm sm:flex">
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

        <div className="flex items-center gap-2">
          <WalletWidget />
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-btn text-secondary transition-colors hover:text-white sm:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile slide-over menu */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.button
              aria-label="Close menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
            />
            <motion.nav
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="fixed bottom-0 right-0 top-0 z-50 flex w-64 flex-col gap-1 border-l bg-surface p-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),1rem)] sm:hidden"
            >
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <SnakeLogo size={18} />
                  <span>
                    Snake<span className="text-accent">Arena</span>
                  </span>
                </span>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="flex h-10 w-10 items-center justify-center text-secondary hover:text-white"
                >
                  ✕
                </button>
              </div>
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex min-h-12 items-center rounded-btn px-3 text-base transition-colors ${
                    pathname === item.href
                      ? 'bg-accent/10 font-medium text-accent'
                      : 'text-secondary hover:bg-surface-elevated hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-auto px-2">
                <NetworkChip className="w-fit" />
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
