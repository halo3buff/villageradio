import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
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
