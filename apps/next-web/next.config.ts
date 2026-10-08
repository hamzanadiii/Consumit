import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(process.env.CONSUMIT_NEXT_DIST_DIR ? { distDir: process.env.CONSUMIT_NEXT_DIST_DIR } : {}),
  output: 'standalone',
  outputFileTracingRoot: `${process.cwd()}/../..`,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // Public title ISR relies on Next's inline bootstrap. Restrict the
      // document/navigation surfaces without forcing nonce-bound SSR.
      { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'" },
    ] }]
  },
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
      {
        hostname: 's4.anilist.co',
        pathname: '/file/anilistcdn/**',
        protocol: 'https',
      },
    ],
  },
  async rewrites() {
    // This independent frontend proxies the same configured first-party API.
    const api = (process.env.CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
    return [{ destination: `${api}/v1/:path*`, source: '/v1/:path*' }]
  },
  transpilePackages: ['@consumit/contracts', '@consumit/next-ui'],
  // Development only: accept HMR and dev-asset requests when browsing
  // through the Docker gateway origin instead of the dev server directly.
  ...(process.env.NODE_ENV !== 'production'
    ? { allowedDevOrigins: ['localhost:8080', '127.0.0.1:8080'] }
    : {}),
}

export default nextConfig
