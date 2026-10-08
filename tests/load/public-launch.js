import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const errors = new Rate('launch_unexpected_errors')
const pageTime = new Trend('launch_warm_page_ms', true)
const apiTime = new Trend('launch_warm_api_ms', true)
const origin = __ENV.CONSUMIT_LAUNCH_URL || 'https://consumit.online'
if (!origin.startsWith('https://')) throw new Error('Public launch baseline requires HTTPS.')
const headers = __ENV.CF_ACCESS_CLIENT_ID && __ENV.CF_ACCESS_CLIENT_SECRET ? {
  'CF-Access-Client-Id': __ENV.CF_ACCESS_CLIENT_ID,
  'CF-Access-Client-Secret': __ENV.CF_ACCESS_CLIENT_SECRET,
} : {}
export const options = {
  scenarios: { website_sessions: { executor: 'constant-vus', vus: 50, duration: '10m', gracefulStop: '30s' } },
  thresholds: {
    launch_unexpected_errors: ['rate<0.01'],
    launch_warm_page_ms: ['p(95)<2000'],
    launch_warm_api_ms: ['p(95)<2000'],
    checks: ['rate>0.99'],
  },
};
export function setup() {
  for (const path of ['/', '/movies', '/series', '/anime', '/v1/titles/discover?kind=movie']) {
    const response = http.get(origin + path, { headers, timeout: '15s' })
    if (response.status !== 200) throw new Error('Launch warmup failed; verify temporary tester access and readiness.')
  }
}
export default function () {
  const path = ['/', '/movies', '/series', '/anime'][(__VU + __ITER) % 4]
  const page = http.get(origin + path, { headers, timeout: '15s', tags: { surface: 'page' } })
  pageTime.add(page.timings.duration)
  errors.add(page.status !== 200)
  check(page, { 'website responds': response => response.status === 200 })
  const catalog = http.get(origin + '/v1/titles/discover?kind=movie', { headers, timeout: '15s', tags: { surface: 'api' } })
  apiTime.add(catalog.timings.duration)
  errors.add(catalog.status !== 200)
  check(catalog, { 'catalog responds': response => response.status === 200 })
  const privateResult = http.get(origin + '/v1/me/library', { headers, timeout: '15s', tags: { surface: 'private-api' } })
  apiTime.add(privateResult.timings.duration)
  errors.add(privateResult.status !== 401)
  check(privateResult, {
    'anonymous library is rejected': response => response.status === 401,
    'private response is uncached': response => /private|no-store/.test(response.headers['Cache-Control'] || '')
      && !/^(HIT|STALE|UPDATING|REVALIDATED)$/i.test(response.headers['Cf-Cache-Status'] || '')
      && response.headers.Age === undefined,
  })
  // Fifty independent cookie jars model public browsing sessions. Authentication
  // and media behavior are covered by controlled HTTPS browser launch checks.
  sleep(15 + ((__VU + __ITER) % 15))
}
