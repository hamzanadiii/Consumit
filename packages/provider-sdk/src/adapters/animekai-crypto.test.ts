import { createPublicKey, verify } from 'node:crypto'
import { expect, it } from 'vitest'
import { createAnimeKaiAttestation } from './animekai.ts'

it('signs the exact challenge with a verifiable P-256 DER signature', async () => {
  const nonce = 'Consumit challenge · nonce'
  const attestation = await createAnimeKaiAttestation(nonce)
  const key = createPublicKey({ key: attestation.publicKey, format: 'jwk' })
  expect(verify('sha256', Buffer.from(nonce), key, Buffer.from(attestation.signature, 'base64url'))).toBe(true)
  expect(verify('sha256', Buffer.from(nonce + ' changed'), key, Buffer.from(attestation.signature, 'base64url'))).toBe(false)
  expect(attestation.publicKey).not.toHaveProperty('d')
})
