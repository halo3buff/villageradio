import type { Metadata, Viewport } from 'next';
import { Space_Mono, DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { AudioProvider } from '@/lib/audio-context';
import { getBroadcast } from '@/lib/content/loaders';
import { Nav } from '@/components/Nav';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NewsStrip } from '@/components/NewsStrip';
import { SiteFrame } from '@/components/SiteFrame';
import { ClearanceWarden } from '@/components/ClearanceWarden';

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

// Display + body faces for the redesigned homepage (used via CSS variables).
const helveticaBlack = localFont({
  src: './fonts/HelveticaNeueBlack.otf',
  variable: '--font-hn-black',
  display: 'swap',
});

const helveticaMedium = localFont({
  src: './fonts/HelveticaNeueMedium.otf',
  variable: '--font-hn-medium',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'overlays-content',
};

export const metadata: Metadata = {
  title: {
    default: 'Village Radio',
    template: '%s — Village Radio',
  },
  description: '24/7 — vlgfm.live',
  metadataBase: new URL('https://vlgfm.live'),
  openGraph: {
    title: 'Village Radio',
    description: '24/7 — vlgfm.live',
    url: 'https://vlgfm.live',
    siteName: 'Village Radio',
    images: [{ url: 'https://vlgfm.live/og-image-3.jpg' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Village Radio',
    description: '24/7 — vlgfm.live',
    images: ['https://vlgfm.live/og-image-3.jpg'],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const playlist = await getBroadcast();
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${dmSans.variable} ${ibmPlexMono.variable} ${helveticaBlack.variable} ${helveticaMedium.variable}`}
    >
      <head>
        <meta name="theme-color" content="#080808" />
      </head>
      <body className="bg-[#080808] text-vr-white min-h-screen font-sans">
        <AudioProvider playlist={playlist}>
          {/* Burns a gated page's clearance the moment the visitor leaves it */}
          <ClearanceWarden />
          <SiteFrame nav={<Nav />} newsStrip={<NewsStrip />} audioPlayer={<AudioPlayer />}>
            {children}
          </SiteFrame>
        </AudioProvider>
      </body>
    </html>
  );
}
