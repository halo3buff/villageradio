import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Hide the Next.js dev-tools indicator (the floating "N" badge shown in development).
  devIndicators: false,
  // /melee/online frames each player's own local melee-web build, whose engine threads need a
  // cross-origin isolated page all the way up. Only this page is isolated: site-wide it would
  // block the YouTube embeds.
  async headers() {
    return [{
      source: '/melee/online',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    }];
  },
  // `melee` is the online version now; the drop-your-own-disc one stays at /melee/basic
  async redirects() {
    return [{ source: '/melee', destination: '/melee/online', permanent: false }];
  },
  images: {
    formats: ['image/webp', 'image/avif'],
    // Admin-uploaded photos/work images are served from the public R2 bucket via next/image.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-fa76dac35d0c4ddf9a81d5267a06b241.r2.dev',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
