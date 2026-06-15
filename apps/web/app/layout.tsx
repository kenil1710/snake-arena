import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Baloo_2 } from 'next/font/google';
import '@coinbase/onchainkit/styles.css';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/Header';
import { Toaster } from '@/components/Toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });
// Rounded, chunky display face — headings, buttons, scores, big numbers.
const baloo = Baloo_2({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-baloo' });

export const metadata: Metadata = {
  title: 'SnakeArena — Play Snake. Win USDC.',
  description:
    'A daily Snake tournament on Base. Pay to enter, chase the high score, and the top 3 split the prize pool. Live on Base.',
};

export const viewport: Viewport = {
  themeColor: '#04241f',
  width: 'device-width',
  initialScale: 1,
  // Base App renders mini apps edge-to-edge; we pad with safe-area insets.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${baloo.variable}`}>
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
