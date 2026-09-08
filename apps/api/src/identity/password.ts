import { randomBytes } from 'node:crypto'

import { argon2id, argon2Verify } from 'hash-wasm'

// OWASP minimums: 19 MiB memory (KiB units here), 2 iterations, 1 lane.
// hash-wasm runs on Node and Bun alike — important because vitest executes
// under Node while production runs on Bun, where a Bun-only API would leave
// this module untestable.
const MEMORY_KIB = 19456
const ITERATIONS = 2
const PARALLELISM = 1
const SALT_BYTES = 16

/**
 * Single password module. No hashing logic anywhere else, and no hashing
 * parameters anywhere else.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    hashLength: 32,
    iterations: ITERATIONS,
    memorySize: MEMORY_KIB,
    outputType: 'encoded',
    parallelism: PARALLELISM,
    password,
    salt: randomBytes(SALT_BYTES),
  })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ hash, password })
  } catch {
    return false
  }
}
