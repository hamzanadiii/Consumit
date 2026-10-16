import type { NextConfig } from 'next'

// Content-Security-Policy for the HTML surface.
// - script-src-attr 'none' blocks injected event-handler XSS (onclick= etc.).
// - script-src-elem keeps 'unsafe-inline' only because Next's inline hydration
//   bootstrap requires it; the host allowlist blocks unexpected external
//   scripts (a future injected <script src=attacker> is refused).
// - Ad creatives run in sandboxed iframes (opaque origin) restricted to the
//   ad partner host; GA and the Cast sender are the other external scripts.
// - media-src allows https: because playback sources are validated
//   host-allowlisted provider URLs fetched directly by the browser.
// - Development additionally needs 'unsafe-eval' and websocket origins for
//   Next's HMR runtime; production never includes them.
const isDev = process.env.NODE_ENV !== 'production'
// Exact controlled-media origin, admitted only by the isolated development fixture.
const playbackFixtureMedia = isDev && process.env.PLAYBACK_FIXTURE_PROXY === '1' ? ['http://127-0-0-1.nip.io:18560'] : []
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src-attr 'none'",
  ...(isDev ? ["script-src 'self' 'unsafe-eval'"] : []),
  [
    "script-src-elem 'self' 'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    'https://www.googletagmanager.com https://www.gstatic.com https://www.highrevenueformat.com',
  ].join(' '),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://image.tmdb.org https://www.themoviedb.org https://s4.anilist.co https://api.dicebear.com https://www.highrevenueformat.com",
  "font-src 'self'",
  [
    "connect-src 'self'",
    ...playbackFixtureMedia,
    ...(isDev ? ['ws: wss:'] : []),
    'https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.gstatic.com https://www.google.com',
  ].join(' '),
  ["media-src 'self' blob: https:", ...playbackFixtureMedia].join(' '),
  "frame-src 'self' https://www.gstatic.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ')

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
      // Ignored by browsers on http://localhost, so local dev is unaffected.
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      // Public title ISR relies on Next's inline bootstrap, so script-src-elem
      // keeps 'unsafe-inline' (see CONTENT_SECURITY_POLICY note above).
      { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
    ] }, {
      source: '/watch/:path*',
      headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
    }]
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
    if (process.env.NODE_ENV !== 'development' && process.env.PLAYBACK_FIXTURE_PROXY !== '1') return []
    const api = (process.env.CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
    return [{ destination: `${api}/v1/:path*`, source: '/v1/:path*' }]
  },
  transpilePackages: ['@consumit/contracts', '@consumit/ui'],
  // Development only: accept HMR and dev-asset requests when browsing
  // through the Docker gateway origin instead of the dev server directly.
  ...(process.env.NODE_ENV !== 'production'
    ? { allowedDevOrigins: ['localhost:8080', '127.0.0.1:8080', '127.0.0.1'] }
    : {}),
}

export default nextConfig
