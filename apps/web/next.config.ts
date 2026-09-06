import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
        protocol: 'https',
      },
      {
        hostname: 'www.themoviedb.org',
        pathname: '/assets/**',
        protocol: 'https',
      },
    ],
  },
  transpilePackages: ['@consumit/contracts', '@consumit/ui'],
}

export default nextConfig
