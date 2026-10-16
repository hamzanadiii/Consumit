import { describe, expect, it } from 'vitest'
import { sealCinejoyRequest } from './cinejoy-gate.ts'

const request = '{"path":"/Lisbon/movie","payload":{"tmdb":"550","imdb":"tt0137523","year":"1999","title":"Fight Club"}}'
const entropy = Uint8Array.from({ length: 44 }, (_, i) => i)
// Captured from PROVE's v2 seal in an isolated browser with fixed entropy.
const vector = '020204992ded08677fe753e98b312d6a0949035142170ad2f45fbe836f65afbe261ea6cda9ff4b5bec7e43dcfbcb37dd7788becd9c4b82bf7e92c633e416973f0891df202122232425262728292a2bebbe3bf7355d00a48ea395c79c985ce8a03eabd4425829b6cbfffefd3d93d3fa46e97d48d0acd0e7b729986be9bbbb81aff39e0c9e74ea682e86b85ea8b487c43e03188d3d0f7fe789398acadd265d5408f195ab27124d9aa7f8578a3f463007c02d80b5d8cb7b78edb35612e9abde433be2ec4f18fcc3'
const responseVector = '0909090909090909090909099cefd7dbdc5f36f697adc28220f9f715e7fe481193aa8548dd0b54'

describe('CineJoy native v2 handshake', () => {
  it('matches the external request vector and authenticates the paired response', () => {
    const sealed = sealCinejoyRequest(request, entropy)
    expect(sealed.body.toString('hex')).toBe(vector)
    expect(sealed.open(Buffer.from(responseVector, 'hex'))).toBe('{"ok":true}')
  })
  it('rejects truncated, oversized, and tampered envelopes', () => {
    const sealed = sealCinejoyRequest(request, entropy)
    const tampered = Buffer.from(responseVector, 'hex'); tampered[15] = tampered[15]! ^ 1
    expect(() => sealed.open(tampered)).toThrow('malformed')
    expect(() => sealed.open(new Uint8Array(28))).toThrow('malformed')
    expect(() => sealed.open(new Uint8Array(1_048_577))).toThrow('malformed')
    expect(() => sealCinejoyRequest('a'.repeat(4097), entropy)).toThrow('malformed')
    expect(() => sealCinejoyRequest(request, new Uint8Array(43))).toThrow('malformed')
  })
  it('uses fresh entropy for separate requests', () => {
    expect(sealCinejoyRequest(request).body.equals(sealCinejoyRequest(request).body)).toBe(false)
  })
})
