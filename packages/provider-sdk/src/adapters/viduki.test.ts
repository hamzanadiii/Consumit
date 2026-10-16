import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createVidukiProvider } from './viduki.ts'
import type { ProviderHttp } from './http.ts'

const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const now = () => Date.parse('2026-10-03T00:00:00Z')

/** A proof-of-work the adapter solves within a few iterations. */
function solvableChallenge() {
  const salt = 'viduki-test'
  const challenge = createHash('sha256').update(`${salt}2`).digest('hex')
  return { algorithm: 'SHA-256', challenge, maxnumber: 50, salt, signature: 'sig' }
}

function fixture(options: { altcha?: unknown; bootstrap?: unknown; pepper?: unknown; servers?: unknown; manifest?: unknown; wasmBytes?: Uint8Array | null } = {}) {
  const challenge = solvableChallenge()
  return vi.fn<ProviderHttp>(async (url) => {
    if (url.endsWith('/altcha-challenge')) return { url, status: 200, text: JSON.stringify(options.altcha ?? challenge) }
    if (url.endsWith('/bootstrap')) return { url, status: 200, text: JSON.stringify(options.bootstrap ?? { n: 'nonce-1' }) }
    if (url.endsWith('/pepper-key')) return { url, status: 200, text: JSON.stringify(options.pepper ?? { bucket: '7', iv: '00', tag: '00', ct: '00' }) }
    if (url.endsWith('/makima-manifest.json')) return { url, status: 200, text: JSON.stringify(options.manifest ?? { url: '/makima.wasm', exports: {} }) }
    if (url.endsWith('/main/servers')) return { url, status: 200, text: JSON.stringify(options.servers ?? [{ name: 'Leon' }]) }
    if (url.endsWith('.wasm')) {
      if (options.wasmBytes === null) return { url, status: 404, text: '' }
      return { url, status: 200, text: '', bytes: options.wasmBytes ?? new Uint8Array([0, 97, 115, 109]) }
    }
    if (url.includes('/main/')) return { url, status: 200, text: JSON.stringify({ sn: 's', tb: '1', iv1: 'a', iv2: 'b', wk: 'c', tag1: 'd', tag2: 'e', ct: 'f' }) }
    throw new Error(`unexpected url ${url}`)
  })
}

describe('Viduki adapter', () => {
  it('walks the handshake in order with nonces on every guarded call', async () => {
    const http = fixture({ manifest: null })
    const result = await createVidukiProvider(http, now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    const urls = http.mock.calls.map(([url]) => url)
    expect(urls[0]).toBe('https://api.viduki.net/altcha-challenge')
    expect(urls[1]).toBe('https://api.viduki.net/bootstrap')
    expect(http.mock.calls[1]?.[1]).toMatchObject({ 'x-altcha': expect.any(String) })
    expect(urls[2]).toBe('https://api.viduki.net/altcha-challenge')
    expect(urls[3]).toBe('https://api.viduki.net/pepper-key')
    expect(http.mock.calls[3]?.[1]).toMatchObject({ 'x-altcha': expect.any(String), 'x-nonce': 'nonce-1' })
  })
  it.each([
    { altcha: {} },
    { altcha: { challenge: 'no-such', salt: 'x', maxnumber: 3 } },
    { bootstrap: {} },
    { bootstrap: { n: null } },
    { pepper: { ct: '00' } },
    { manifest: null },
    { manifest: { url: '/m.wasm', exports: {} }, wasmBytes: null },
    { servers: [] },
  ])('returns no source when any handshake stage rejects: %j', async (options) => {
    expect(await createVidukiProvider(fixture(options), now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
  }, 20_000)
  it('rejects anime before any upstream call', async () => {
    const http = fixture()
    expect(await createVidukiProvider(http, now).resolve({ ...input, ref: { kind: 'anime' as const, id: 21, episode: 1 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
