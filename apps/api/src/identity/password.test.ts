import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password.ts'

describe('password service', () => {
  it('hashes with Argon2id at OWASP minimums and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple')

    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true)
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('rejects wrong passwords and malformed hashes without throwing', async () => {
    const hash = await hashPassword('correct horse battery staple')

    expect(await verifyPassword('wrong password', hash)).toBe(false)
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
  })
})
