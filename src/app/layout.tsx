import type { Metadata } from 'next';
import { Space_Mono, DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { AudioProvider } from '@/lib/audio-context';
import { Nav } from '@/components/Nav';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NewsStrip } from '@/components/NewsStrip';

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

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
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
    <html lang="en" className={`${spaceMono.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}>
      <head>
        <meta name="theme-color" content="#080808" />
      </head>
      <body className="bg-[#080808] text-vr-white min-h-screen font-sans">
        <AudioProvider>
          <Nav />
          <div className="pb-[76px]">
            {children}
          </div>
          <NewsStrip />
          <AudioPlayer />
        </AudioProvider>
      </body>
    </html>
  );
}
