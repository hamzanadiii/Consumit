import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

// Run only against the controlled fixture server, never a public provider.
const resolveTime = new Trend('playback_resolve_ms', true)
const limited = new Counter('playback_rate_limited')
http.setResponseCallback(http.expectedStatuses(200, 429))
export const options = { vus: 10, duration: '20s', thresholds: {
  checks: ['rate>0.99'], playback_resolve_ms: ['p(95)<8500'],
}, summaryTrendStats: ['avg', 'p(95)', 'max'] }
const base = __ENV.PLAYBACK_TEST_API || 'http://127.0.0.1:18559'
if (!/^http:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal):18559$/.test(base)) throw new Error('Use the local controlled fixture server.')
export default function () {
  const response = http.post(`${base}/v1/playback/resolve`, JSON.stringify({
    ref: { kind: 'movie', id: 1 }, capabilities: { hls: true, native: true, dash: false, nativeHls: false }, audioLanguage: 'en',
  }), { headers: { origin: 'http://127.0.0.1:27911', 'content-type': 'application/json' }, timeout: '10s', tags: { operation: 'resolve' } })
  check(response, { 'bounded success or admission control': (r) => r.status === 200 || r.status === 429 })
  if (response.status === 200) {
    resolveTime.add(response.timings.duration)
    const session = response.json()
    check(session, { 'direct HTTPS source': (s) => !s.source.headers && s.source.src.startsWith('https://') && !s.source.src.includes('/v1/playback/') })
  } else if (response.status === 429) limited.add(1)
  // The real per-IP admission limit stays enabled; 429 is measured explicitly.
  sleep(response.status === 429 ? 2 : 1)
}
