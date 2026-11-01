import { describe, expect, it } from 'vitest'
import type { ProviderAdapter, ProviderInput } from '../index.ts'
import { resolveConformant } from './provider-conformance.ts'

const input: ProviderInput = { ref: { kind: 'movie', id: 550 }, region: 'US', audioLanguage: 'en' }

describe('provider adapter conformance harness', () => {
  it('accepts a validated direct media result', async () => {
    const provider: ProviderAdapter = {
      id: 'fixture',
      async resolve() {
        return { ok: true, sources: [{
          key: 'fixture:one', url: 'https://media.example/movie.m3u8', type: 'hls',
          expiresAt: '2026-10-25T12:00:00.000Z', language: 'original', headers: {}, subtitles: [],
        }] }
      },
    }
    await expect(resolveConformant(provider, input, new AbortController().signal)).resolves.toMatchObject({ ok: true })
  })

  it('rejects malformed and credential-bearing adapter sources', async () => {
    const invalid: ProviderAdapter[] = [
      { id: 'malformed', async resolve() { return { ok: true, sources: [{ key: '', url: 'https://media.example/a.m3u8', type: 'hls', expiresAt: 'invalid', language: 'original', headers: {}, subtitles: [] }] } } },
      { id: 'credentials', async resolve() { return { ok: true, sources: [{ key: 'x', url: 'https://user:pass@media.example/a.m3u8', type: 'hls', expiresAt: '2026-10-25T12:00:00.000Z', language: 'original', headers: {}, subtitles: [] }] } } },
    ]
    for (const provider of invalid) {
      await expect(resolveConformant(provider, input, new AbortController().signal)).rejects.toThrow(/non-conformant|unsafe source URL/)
    }
  })
})
