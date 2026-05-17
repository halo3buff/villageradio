import type { Metadata } from 'next';
import { Space_Mono, DM_Sans } from 'next/font/google';
import './globals.css';
import { AudioProvider } from '@/lib/audio-context';
import { Nav } from '@/components/Nav';
import { AudioPlayer } from '@/components/AudioPlayer';

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-space-mono',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Village Radio',
    template: '%s — Village Radio',
  },
  description: 'Signal. Archive. Transmission.',
  metadataBase: new URL('https://villageradio.xyz'),
  openGraph: {
    siteName: 'Village Radio',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceMono.variable} ${dmSans.variable}`}>
      <head>
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="bg-black text-vr-white min-h-screen font-sans">
        <AudioProvider>
          <Nav />
          <div className="pb-16">
            {children}
          </div>
          <AudioPlayer />
        </AudioProvider>
      </body>
    </html>
  );
}
