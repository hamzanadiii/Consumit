import assert from 'node:assert/strict'
import test from 'node:test'

const baseUrl = process.env.SERIES_ROUTE_SMOKE_BASE_URL?.replace(/\/$/, '')

test('series detail deep link renders its page', { skip: !baseUrl }, async () => {
  const response = await fetch(`${baseUrl}/series/1622?season=1&episode=1`, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(15_000),
  })
  const html = await response.text()

  assert.equal(response.status, 200, `Expected the series page to render; received HTTP ${response.status}: ${html.slice(0, 160)}`)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i)
  assert.match(html, /data-consumit-series-detail/)
})
