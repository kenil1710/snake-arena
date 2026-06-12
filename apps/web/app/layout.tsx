import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@coinbase/onchainkit/styles.css';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/Header';
import { Toaster } from '@/components/Toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'SnakeArena',
  description:
    'Daily Snake tournaments on Base. Enter with USDC, compete for top scores, split the prize pool.',
};

export const viewport: Viewport = {
  themeColor: '#07090d',
  width: 'device-width',
  initialScale: 1,
  // Base App renders mini apps edge-to-edge; we pad with safe-area insets.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-background pt-[env(safe-area-inset-top)] font-sans text-white antialiased">
        <Providers>
          <Header />
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
