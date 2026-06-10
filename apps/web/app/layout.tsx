import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'SnakeArena',
  description:
    'Daily Snake tournaments on Base. Enter with USDC, compete for top scores, split the prize pool.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-background font-sans text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
