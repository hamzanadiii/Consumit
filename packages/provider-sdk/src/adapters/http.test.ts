import { expect, it } from 'vitest'
import { adapter, document, providerFailureFromOutcomes, type ProviderHttp } from './http.ts'

it.each([
  [403, 'blocked', false],
  [429, 'rate_limited', true],
] as const)('classifies upstream %i separately from empty and transport failures', async (status, code, retryable) => {
  const http: ProviderHttp = async () => ({
    status, text: 'private upstream body must not escape', url: 'https://provider.example/watch',
    headers: new Headers(status === 429 ? { 'retry-after': '7' } : {}),
  })
  const fixture = adapter('fixture', async (_input, signal) => {
    await document(http, 'https://provider.example/watch', signal)
    return []
  })
  const result = await fixture.resolve({ ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)
  expect(result).toMatchObject({ ok: false, code, retryable })
  expect(JSON.stringify(result)).not.toContain('private upstream body')
  if (status === 429) expect(result).toMatchObject({ retryAfterMs: 7000 })
})

it('preserves rate-limit retry-after when all parallel lanes fail', () => {
  expect(providerFailureFromOutcomes([
    { code: 'empty' },
    { code: 'rate_limited', retryAfterMs: 7000 },
    { code: 'blocked' },
  ])).toMatchObject({ code: 'rate_limited', retryAfterMs: 7000 })
})

it('keeps all-lane timeouts distinguishable from empty results', () => {
  expect(providerFailureFromOutcomes([{ code: 'timeout' }, { code: 'timeout' }])).toMatchObject({ code: 'timeout' })
  expect(providerFailureFromOutcomes([{ code: 'empty' }, { code: 'timeout' }])).toMatchObject({ code: 'empty' })
})
