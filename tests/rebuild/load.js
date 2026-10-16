import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const base = __ENV.REBUILD_TEST_API || 'http://127.0.0.1:18591'
if (!/^http:\/\/(?:127\.0\.0\.1|localhost|host\.docker\.internal):1859[12]$/.test(base)) throw new Error('Use only the controlled rebuild fixture gateway.')
const successful = new Counter('successful_requests'), limited = new Counter('rate_limited_requests'), failed = new Counter('failed_requests')
const librarySuccessful = new Counter('successful_library_requests'), progressSuccessful = new Counter('successful_progress_writes')
const reads = new Trend('successful_api_read_ms', true), search = new Trend('successful_search_ms', true), progress = new Trend('successful_progress_write_ms', true)
export const options = { vus: Number(__ENV.VUS || 5), duration: __ENV.DURATION || '20s', thresholds: { successful_api_read_ms: ['p(95)<=250'], successful_search_ms: ['p(95)<=200'], failed_requests: ['count==0'] }, summaryTrendStats: ['avg', 'p(75)', 'p(95)', 'max'] }
function record(response, metric, operation = 'read') {
  if (response.status >= 200 && response.status < 300) { successful.add(1); metric.add(response.timings.duration); if (operation === 'library') librarySuccessful.add(1); if (operation === 'progress') progressSuccessful.add(1) }
  else if (response.status === 429) limited.add(1)
  else failed.add(1)
  check(response, { 'bounded response': result => result.status >= 200 && result.status < 300 || result.status === 429 })
}
export function setup() {
  failed.add(0); limited.add(0)
  const login = http.post(`${base}/v1/auth/login`, JSON.stringify({ email: 'rebuild-browser@example.test', password: 'RebuildBrowserPassword123!' }), { headers: { origin: 'http://127.0.0.1:28119', 'content-type': 'application/json' } })
  if (login.status !== 200) throw new Error('Fixture sign-in failed.')
  if (__ENV.FAIL_PLAYBACK === '1') http.post(`${base}/__fixtures/stop-playback`)
  const token = login.cookies.consumit_session?.[0]?.value
  if (!token) throw new Error('Fixture session was not issued.')
  return { token }
}
export default function ({ token }) {
  record(http.get(`${base}/v1/titles/discover?kind=movie`), reads)
  record(http.get(`${base}/v1/titles/search?q=Dune&kind=movie`), search)
  const headers = { Cookie: `consumit_session=${token}`, origin: 'http://127.0.0.1:28119', 'content-type': 'application/json' }
  record(http.get(`${base}/v1/me/library`, { headers }), reads, 'library')
  if (__ITER % 4 === 0) record(http.put(`${base}/v1/progress`, JSON.stringify({ kind: 'movie', id: 693134, positionSeconds: 10, durationSeconds: 30 }), { headers }), progress, 'progress')
  sleep(1)
}
