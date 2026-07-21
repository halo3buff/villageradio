import type { Metadata, Viewport } from 'next';
import { Space_Mono, DM_Sans, IBM_Plex_Mono, VT323 } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { AudioProvider } from '@/lib/audio-context';
import { getBroadcast, getTheme } from '@/lib/content/loaders';
import { DEFAULT_THEME, isThemeName, siteCssVars } from '@/lib/theme';
import { Nav } from '@/components/Nav';
import { AudioPlayer } from '@/components/AudioPlayer';
import { SiteFrame } from '@/components/SiteFrame';
import { ClearanceWarden } from '@/components/ClearanceWarden';
import { ThemeProvider } from '@/components/ThemeProvider';

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

// Bitmap-style face for the DSPower instrument canvases (resolved from the CSS
// var by retro.ts pixelFont(), since ctx.font can't read var()).
const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-vt323',
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

// Real seven-segment LCD faces (DSEG, SIL OFL) for the broadcast MHz counter.
const dseg7 = localFont({
  src: './fonts/DSEG7Classic-Italic.woff2',
  variable: '--font-dseg7',
  display: 'swap',
});

const dseg14 = localFont({
  src: './fonts/DSEG14Classic-Italic.woff2',
  variable: '--font-dseg14',
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
  const [playlist, rawTheme] = await Promise.all([getBroadcast(), getTheme()]);
  const theme = isThemeName(rawTheme) ? rawTheme : DEFAULT_THEME;
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${spaceMono.variable} ${dmSans.variable} ${ibmPlexMono.variable} ${vt323.variable} ${helveticaBlack.variable} ${helveticaMedium.variable} ${dseg7.variable} ${dseg14.variable}`}
    >
      <head>
        <meta name="theme-color" content="#080808" />
        <style dangerouslySetInnerHTML={{ __html: siteCssVars(theme) }} />
      </head>
      <body className="bg-[var(--vlg-bg)] text-[var(--vlg-fg)] min-h-screen font-sans">
        <ThemeProvider name={theme}>
          <AudioProvider playlist={playlist}>
            {/* Burns a gated page's clearance the moment the visitor leaves it */}
            <ClearanceWarden />
            <SiteFrame nav={<Nav />} audioPlayer={<AudioPlayer />}>
              {children}
            </SiteFrame>
          </AudioProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
