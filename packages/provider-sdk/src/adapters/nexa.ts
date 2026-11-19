import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { ProviderAdapter, ProviderInput, ProviderSource } from '../index.ts'
import { assertHlsManifest, parseHlsReferenceEntries } from '../manifest.ts'
import { adapter, document, masterVariantHeights, ProviderFailure, sourceAccess, type ProviderHttp } from './http.ts'

const SITE = 'https://nexa.mov'
const SOURCES = 'https://providers.nexa.mov'
const PLAYLIST_URL = SOURCES + '/v1/playlist'
const CDN_ORIGIN = 'https://indiacdn.sbs'
const CDN_HOSTS = new Set(['indiacdn.sbs'])
const CONFIG_VERSION = 28
const HEADER_BYTES = 14
const NONCE_BYTES = 24
const TAG_BYTES = 16
const MAX_LANES = 5
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const REQUEST_HEADERS = {
  'user-agent': UA,
  accept: '*/*',
  origin: SITE,
  referer: SITE + '/',
  'content-type': 'application/octet-stream',
}

/**
 * Nexa runtime ABI 2, config version 28. These five lanes are the TMDB-capable
 * entries in the statically inspected source table. Keys are stored in the
 * provider artifact XOR-masked; this reviewed table contains their decoded
 * 32-byte values so resolution never downloads or executes provider code.
 */
const LANES = [
  { codename: 'nova', token: '587068189173d998', key: '25f4fbb71515d4dba46b27fe82cd3dff83f0c00af943a785e6b20b381c8a88a9' },
  { codename: 'onyx', token: '2391a3c1949acfa0', key: 'eaca9dab89194453f599bc5f96cbac24cda3485ac6861635a0e8f9fede25f7ce' },
  { codename: 'flux', token: '97e5f9961906dabb', key: '7bf796579707bfdb7c6d42c386fd2bddd0542347d9edf47162c2292e4a1ce9c0' },
  { codename: 'sylver', token: 'd04043f145f3cc50', key: '412e26488ae7419b284ac08d6c23042f27c841e88a358d734b76ca22d34e47c3' },
  { codename: 'verlon', token: 'a389924a0880b7b9', key: 'e1d509b394a112121566cc467ebc30f07c1aa56a446f9e745b92808fc36bcd56' },
] as const

const openedSchema = z.object({
  url: z.string().min(1).max(4096),
  format: z.enum(['hls', 'dash', 'file']).optional(),
}).passthrough()

function quarterRound(state: number[], a: number, b: number, c: number, d: number) {
  state[a] = (state[a]! + state[b]!) >>> 0
  state[d] = rotateLeft(state[d]! ^ state[a]!, 16)
  state[c] = (state[c]! + state[d]!) >>> 0
  state[b] = rotateLeft(state[b]! ^ state[c]!, 12)
  state[a] = (state[a]! + state[b]!) >>> 0
  state[d] = rotateLeft(state[d]! ^ state[a]!, 8)
  state[c] = (state[c]! + state[d]!) >>> 0
  state[b] = rotateLeft(state[b]! ^ state[c]!, 7)
}

function rotateLeft(value: number, bits: number) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}

/** XChaCha20's HChaCha20 subkey derivation; the AEAD itself uses Node's native implementation. */
function hChaCha20(key: Buffer, nonce16: Buffer) {
  const constants = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]
  const state = [
    ...constants,
    ...Array.from({ length: 8 }, (_, index) => key.readUInt32LE(index * 4)),
    ...Array.from({ length: 4 }, (_, index) => nonce16.readUInt32LE(index * 4)),
  ]
  for (let round = 0; round < 10; round++) {
    quarterRound(state, 0, 4, 8, 12)
    quarterRound(state, 1, 5, 9, 13)
    quarterRound(state, 2, 6, 10, 14)
    quarterRound(state, 3, 7, 11, 15)
    quarterRound(state, 0, 5, 10, 15)
    quarterRound(state, 1, 6, 11, 12)
    quarterRound(state, 2, 7, 8, 13)
    quarterRound(state, 3, 4, 9, 14)
  }
  const subkey = Buffer.alloc(32)
  for (const [offset, word] of [0, 1, 2, 3, 12, 13, 14, 15].entries()) {
    subkey.writeUInt32LE(state[word]!, offset * 4)
  }
  state.fill(0)
  return subkey
}

function xNonce(nonce: Buffer) {
  const shortNonce = Buffer.alloc(12)
  nonce.copy(shortNonce, 4, 16, 24)
  return shortNonce
}

function makeHeader(tokenHex: string) {
  const header = Buffer.alloc(HEADER_BYTES)
  header.write('NXS1', 0, 'ascii')
  header.writeUInt16LE(CONFIG_VERSION, 4)
  Buffer.from(tokenHex, 'hex').copy(header, 6)
  return header
}

function sealRequest(lane: (typeof LANES)[number], plaintext: Buffer, nonce = randomBytes(NONCE_BYTES)) {
  if (nonce.length !== NONCE_BYTES) throw new ProviderFailure('malformed')
  const key = Buffer.from(lane.key, 'hex')
  const subkey = hChaCha20(key, nonce.subarray(0, 16))
  key.fill(0)
  try {
    const header = makeHeader(lane.token)
    const cipher = createCipheriv('chacha20-poly1305', subkey, xNonce(nonce), { authTagLength: TAG_BYTES })
    cipher.setAAD(header, { plaintextLength: plaintext.length })
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return Buffer.concat([header, nonce, ciphertext, cipher.getAuthTag()])
  } finally {
    subkey.fill(0)
  }
}

function openResponse(lane: (typeof LANES)[number], response: Uint8Array): Buffer | null {
  if (response.length < NONCE_BYTES + TAG_BYTES) return null
  const bytes = Buffer.from(response)
  const nonce = bytes.subarray(0, NONCE_BYTES)
  const tag = bytes.subarray(bytes.length - TAG_BYTES)
  const ciphertext = bytes.subarray(NONCE_BYTES, bytes.length - TAG_BYTES)
  const key = Buffer.from(lane.key, 'hex')
  const subkey = hChaCha20(key, nonce.subarray(0, 16))
  key.fill(0)
  try {
    const decipher = createDecipheriv('chacha20-poly1305', subkey, xNonce(nonce), { authTagLength: TAG_BYTES })
    decipher.setAAD(makeHeader(lane.token), { plaintextLength: ciphertext.length })
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    return null
  } finally {
    subkey.fill(0)
  }
}

function tmdbQuery(input: ProviderInput) {
  if (input.ref.kind === 'movie') return { p: 'tmdb', i: input.ref.id }
  if (input.ref.kind === 'series') {
    return { p: 'tmdb', i: input.ref.id, s: input.ref.season, e: input.ref.episode }
  }
  throw new ProviderFailure('empty')
}

function checkedMasterUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new ProviderFailure('malformed') }
  if (url.protocol !== 'https:' || !CDN_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port
      || url.pathname !== '/cdn-m3u8' || url.searchParams.size !== 1 || !url.searchParams.has('payload') || url.hash) {
    throw new ProviderFailure('blocked')
  }
  return url
}

function checkManifestHosts(text: string, baseUrl: string) {
  let references: Array<{ url: string; media: boolean }>
  try { references = parseHlsReferenceEntries(text, baseUrl) } catch { throw new ProviderFailure('malformed') }
  for (const reference of references) {
    let url: URL
    try { url = new URL(reference.url) } catch { throw new ProviderFailure('malformed') }
    if (url.protocol !== 'https:' || !CDN_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
      throw new ProviderFailure('blocked')
    }
  }
}

function sourceKey(input: ProviderInput, codename: string, height: number) {
  const { ref } = input
  return ['nexa', ref.kind, ref.id, ref.season ?? '', ref.episode ?? '', codename, height].join(':')
}

export function createNexaProvider(http: ProviderHttp, now: () => number = Date.now): ProviderAdapter {
  return adapter('nexa', async (input, signal) => {
    if (input.ref.kind !== 'movie' && input.ref.kind !== 'series') throw new ProviderFailure('empty')
    const query = Buffer.from(JSON.stringify(tmdbQuery(input)), 'utf8')
    let lastFailure: unknown

    for (const lane of LANES.slice(0, MAX_LANES)) {
      signal.throwIfAborted()
      try {
        const envelope = sealRequest(lane, query)
        const response = await document(http, PLAYLIST_URL, signal, REQUEST_HEADERS, { method: 'POST', body: envelope })
        const responseUrl = new URL(response.url)
        if (responseUrl.origin !== SOURCES || responseUrl.pathname !== '/v1/playlist' || responseUrl.username || responseUrl.password) {
          throw new ProviderFailure('blocked')
        }
        if (!response.bytes || response.bytes.length > 1_048_576) throw new ProviderFailure('malformed')
        const opened = openResponse(lane, response.bytes)
        if (!opened || opened.length > 256 * 1024) throw new ProviderFailure('malformed')
        let decoded: unknown
        try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(opened)) } catch { throw new ProviderFailure('malformed') }
        const parsed = openedSchema.safeParse(decoded)
        if (!parsed.success || (parsed.data.format !== undefined && parsed.data.format !== 'hls')) throw new ProviderFailure('malformed')
        const url = checkedMasterUrl(parsed.data.url)

        const master = await document(http, url.href, signal, { 'user-agent': UA, accept: '*/*', origin: SITE, referer: SITE + '/' })
        const finalUrl = new URL(master.url)
        if (finalUrl.origin !== CDN_ORIGIN || finalUrl.username || finalUrl.password || finalUrl.port) throw new ProviderFailure('blocked')
        if (master.text.length > 1024 * 1024 || !master.text.trimStart().startsWith('#EXTM3U') || assertHlsManifest(master.text) !== 'master') {
          throw new ProviderFailure('malformed')
        }
        checkManifestHosts(master.text, url.href)
        const heights = masterVariantHeights(master.text)
        if (!heights?.length) throw new ProviderFailure('malformed')
        const height = Math.max(...heights)
        return [{
          key: sourceKey(input, lane.codename, height),
          serverName: 'Nexa ' + lane.codename,
          url: url.href,
          type: 'hls',
          height,
          qualityHint: height + 'p',
          qualityGroup: 'nexa-relay',
          ...sourceAccess(url.href, now()),
          language: 'original',
          headers: { accept: '*/*', origin: SITE, referer: SITE + '/', 'user-agent': UA },
          subtitles: [],
        } satisfies ProviderSource]
      } catch (error) {
        if (signal.aborted) throw error
        if (error instanceof ProviderFailure && (error.code === 'blocked' || error.code === 'rate_limited')) throw error
        lastFailure = error
      }
    }
    if (lastFailure) throw lastFailure
    throw new ProviderFailure('empty')
  })
}
