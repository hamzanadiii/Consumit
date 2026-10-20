import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateCinecatSession, signCinecatRequest } from './cinecat-gate.ts'

// A real production exchange captured from cinecat.eu's own player on
// 2026-10-18 (WebCrypto hooks in headless Chrome). Reproducing it proves the
// vendored salt, challenge signature, session unwrap, and tag format.
const TS = 1792341268
const CHALLENGE_N = '7bfc474e103751d0'
const CHALLENGE_S = 'd6a823dd870afaec79f34ccf73e9d522c806deb8275dc20e0833c6a1e476c6e3'
const SESSION_D =
  '33db9ae260d96e53ad59b4d9' +
  '4133548ac91c6dbbefcf018e624209a9917a674feb10279827fb2a9aaad5b7509b60f086d350cf0909afd8d3e99844b874c983f29ba696dd506caaf37a59b68687233c60c8fce9907e5e2c11354adcd5db896710a8ffb657e890eedf489022132accf0e9901625ed9025890395e940bb78569f3acc72bb5dcb9b2c3f1c78ff0ad4b247b68a4f13f3ded4da19a57013fb26d6e251ddbf05aba2cf532bf93b497b890913af35c4'
const TAG_NONCE = 'e39199a5832d3bf2'
const EXPECTED_HEADERS = {
  'x-az-id': 'aef33e1a5cf48a04a576c8b2479bf814',
  'x-az-ts': String(TS),
  'x-az-nonce': TAG_NONCE,
  'x-az-tag': '91577be6ba238a948d3e9061bb20ce67d282cf2cd61cd535ee6e9082382debc4',
}

function challengeFetch(status = 200) {
  const bodies: string[] = []
  const fetchMock = vi.fn(async (_input: unknown, init?: { body?: unknown }) => {
    bodies.push(String(init?.body ?? ''))
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ d: SESSION_D }),
    } as unknown as Response
  })
  return { bodies, fetchMock }
}

function nonces(...values: string[]) {
  return () => values.shift() ?? (() => { throw new Error('unexpected randomHex call') })()
}

beforeEach(() => {
  invalidateCinecatSession()
})

describe('Cinecat x-az gate', () => {
  it('reproduces the captured challenge signature and mints matching content headers', async () => {
    const { bodies, fetchMock } = challengeFetch()
    const headers = await signCinecatRequest('https://cdn.hls.lol', '/content/movie/550', {
      fetch: fetchMock as unknown as typeof fetch,
      now: () => TS * 1000,
      randomHex: nonces(CHALLENGE_N, TAG_NONCE),
      timeoutMs: 1000,
    })
    expect(bodies).toHaveLength(1)
    expect(JSON.parse(bodies[0]!)).toEqual({ c: 'z', ts: TS, n: CHALLENGE_N, s: CHALLENGE_S })
    expect(headers).toEqual(EXPECTED_HEADERS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method?: string; headers?: Record<string, string> }]
    expect(url).toBe('https://cdn.hls.lol/content/index')
    expect(init?.method).toBe('POST')
    expect(init?.headers?.['content-type']).toBe('application/json')
  })

  it('reuses the 30-minute session for later paths and re-challenges after a clear', async () => {
    const { bodies, fetchMock } = challengeFetch()
    const options = {
      fetch: fetchMock as unknown as typeof fetch,
      now: () => TS * 1000,
      timeoutMs: 1000,
    }
    const first = await signCinecatRequest('https://cdn.hls.lol', '/content/movie/550', { ...options, randomHex: nonces(CHALLENGE_N, TAG_NONCE) })
    const secondNonce = '0011223344556677'
    const second = await signCinecatRequest('https://cdn.hls.lol', '/content/tv/1396/1/3', { ...options, randomHex: nonces(secondNonce) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first['x-az-id']).toBe(second['x-az-id'])
    expect(second['x-az-nonce']).toBe(secondNonce)
    expect(second['x-az-tag']).not.toBe(first['x-az-tag'])

    invalidateCinecatSession()
    await signCinecatRequest('https://cdn.hls.lol', '/content/movie/1', { ...options, randomHex: nonces(CHALLENGE_N, TAG_NONCE) })
    expect(bodies).toHaveLength(2)
  })

  it('surfaces a failed challenge as a thrown gate error', async () => {
    const { fetchMock } = challengeFetch(403)
    await expect(
      signCinecatRequest('https://cdn.hls.lol', '/content/movie/550', {
        fetch: fetchMock as unknown as typeof fetch,
        now: () => TS * 1000,
        randomHex: nonces(CHALLENGE_N),
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('cinecat challenge HTTP 403')
  })

  it('rejects a session blob that fails authentication', async () => {
    const { fetchMock } = challengeFetch()
    const tampered = SESSION_D.slice(0, -4) + '0000'
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ d: tampered }),
    } as unknown as Response)
    await expect(
      signCinecatRequest('https://cdn.hls.lol', '/content/movie/550', {
        fetch: fetchMock as unknown as typeof fetch,
        now: () => TS * 1000,
        randomHex: nonces(CHALLENGE_N),
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('failed authentication')
  })
})
