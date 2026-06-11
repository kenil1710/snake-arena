'use client';

import Link from 'next/link';
import { WalletWidget } from './WalletWidget';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Snake<span className="text-accent">Arena</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/" className="transition-colors hover:text-white">
              Lobby
            </Link>
            <Link href="/profile" className="transition-colors hover:text-white">
              Profile
            </Link>
          </nav>
        </div>
        <WalletWidget />
      </div>
    </header>
  );
}
