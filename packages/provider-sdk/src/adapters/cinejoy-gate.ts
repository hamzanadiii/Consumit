import { createCipheriv, createDecipheriv, createECDH, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { ProviderFailure } from './http.ts'

// Native lumen-gate-v2 protocol, checked against the 2026-10-02 PROVE
// request vector. Upstream WASM is never downloaded or executed by this adapter.
const domain = 'lumen-gate-v2'
const keyId = 2
const serverPublicKey = Buffer.from('045c88a0ae33c683a4872590b04b22f4774a4fe1c6ecf74785c74a919a71207ca94f9e6b5a7854c3aa3b44ee46bc444fea694b9f23bcd80f864ecbef48c1ef6e14', 'hex')

export function sealCinejoyRequest(data: string, entropy: Uint8Array = randomBytes(44)) {
  const plaintext = Buffer.from(data, 'utf8')
  if (entropy.byteLength !== 44 || plaintext.length > 4096) throw new ProviderFailure('malformed')
  const ecdh = createECDH('prime256v1')
  let ready = false
  for (let attempt = 0; attempt < 4; attempt++) {
    const counter = Buffer.alloc(4)
    counter.writeUInt32BE(attempt)
    const secret = createHash('sha256').update(`${domain}|ephemeral|`).update(entropy.subarray(0, 32)).update(counter).digest()
    try { ecdh.setPrivateKey(secret); ready = true; break } catch { /* try the next bounded derivation */ }
  }
  if (!ready) throw new ProviderFailure('malformed')
  const publicKey = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(serverPublicKey)
  const requestKey = Buffer.from(hkdfSync('sha256', shared, publicKey, `${domain}|c2s`, 32))
  const responseKey = Buffer.from(hkdfSync('sha256', shared, publicKey, `${domain}|s2c`, 32))
  const nonce = entropy.subarray(32)
  const aad = (direction: number) => Buffer.concat([Buffer.from(domain), Buffer.from([0, direction, keyId]), publicKey])
  const cipher = createCipheriv('aes-256-gcm', requestKey, nonce)
  cipher.setAAD(aad(1))
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  const body = Buffer.concat([Buffer.from([2, keyId]), publicKey, nonce, encrypted])
  return {
    body,
    open(bytes: Uint8Array) {
      if (bytes.byteLength < 29 || bytes.byteLength > 1_048_576) throw new ProviderFailure('malformed')
      const response = Buffer.from(bytes)
      try {
        const decipher = createDecipheriv('aes-256-gcm', responseKey, response.subarray(0, 12))
        decipher.setAAD(aad(2))
        decipher.setAuthTag(response.subarray(-16))
        return Buffer.concat([decipher.update(response.subarray(12, -16)), decipher.final()]).toString('utf8')
      } catch { throw new ProviderFailure('malformed') }
    },
  }
}
