import { Buffer } from 'node:buffer'

const SHA_CONSTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
]
const MAGIC = [109, 118, 109, 49]

const triEven = (e: number) => ((e * (e + 1)) & 1) === 0

function mix32(e: number): number {
  e >>>= 0
  e ^= e >>> 16
  e = Math.imul(e, 0x85ebca6b) >>> 0
  e ^= e >>> 13
  e = Math.imul(e, 0xc2b2ae35) >>> 0
  return (e ^= e >>> 16) >>> 0
}

function rotl32(e: number, t: number): number {
  e >>>= 0
  if ((t &= 31) === 0) return e >>> 0
  return ((e << t) | (e >>> (32 - t))) >>> 0
}

export function keystream(seed: string, mediaId: number, len: number): Uint8Array {
  let S: number[]
  let acc: number
  if (((seed.length * (seed.length + 1)) & 1) === 1) {
    const t: number[] = Array(256)
    for (let e = 0; e < 256; e++) t[e] = e
    let a = 0
    for (let s = 0; s < 256; s++) {
      a = (a + t[s]! + seed.charCodeAt(s % seed.length)) & 255
      const r = t[s]!
      t[s] = t[a]!
      t[a] = r
    }
    S = t
    let accV = 0x67452301
    for (let a = 0; a < seed.length; a++) {
      accV = rotl32((accV ^ Math.imul(seed.charCodeAt(a), SHA_CONSTS[15 & a]!)) >>> 0, 5)
    }
    acc = mix32(accV)
  } else {
    let f = 0x811c9dc5
    for (let a = 0; a < seed.length; a++) f = Math.imul(f ^ seed.charCodeAt(a), 0x1000193) >>> 0
    let r = mix32((mix32(f) ^ mix32((mediaId >>> 0) ^ 0x9e3779b9)) >>> 0)
    S = new Array<number>(61)
    for (let e = 0; e < 8; e++) {
      if (triEven(e)) {
        const t = r % 61
        r = rotl32((r + 0x9e3779b9) >>> 0, 7 + (7 & e))
        S[t] = (r ^ mix32(r)) >>> 0
        r = mix32((r + t) >>> 0)
      } else {
        S[e] = SHA_CONSTS[15 & e]!
      }
    }
    acc = mix32((0xa5a5a5a5 ^ r) >>> 0)
  }
  const out = new Uint8Array(len)
  let n = 0
  for (let e = 0; e < len;) {
    const i = acc % 61
    const o = i in S ? -1 : 0
    const l = (S[i] as number) >>> 0
    const c = Math.imul(0x9e3779b9, n + 1) >>> 0
    const s_ = (l ^ c) >>> 0
    const h = (((acc ^ s_) >>> 0) | ((acc & s_ & o) >>> 0)) >>> 0
    acc = mix32(((rotl32((h + acc) >>> 0, 31 & i) ^ rotl32(acc, 31 & Math.imul(i, 7))) >>> 0) + 0x9e3779b9 >>> 0)
    S[i] = acc >>> 0
    const w = acc >>> 0
    n++
    out[e++] = 255 & w
    if (e < len) out[e++] = (w >>> 8) & 255
    if (e < len) out[e++] = (w >>> 16) & 255
    if (e < len) out[e++] = (w >>> 24) & 255
  }
  return out
}

export function decryptWecollegePayload(sealed: string, seed: string, mediaId: number): any {
  const raw = Buffer.from(sealed, 'base64url')
  const ks = keystream(seed, mediaId, raw.length)
  const pt = Buffer.alloc(raw.length)
  for (let i = 0; i < raw.length; i++) {
    pt[i] = raw[i]! ^ ks[i]!
  }
  for (let i = 0; i < 4; i++) {
    if (pt[i] !== MAGIC[i]) {
      throw new Error('Invalid magic prefix in WeCollege payload')
    }
  }
  const jsonStr = pt.subarray(4).toString('utf8')
  return JSON.parse(jsonStr)
}
