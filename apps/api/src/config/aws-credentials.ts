import { readFileSync } from 'node:fs'
import { z } from 'zod'

const credentialsSchema = z.object({ accessKeyId: z.string().regex(/^[A-Z0-9]{16,128}$/), secretAccessKey: z.string().regex(/^[A-Za-z0-9/+=]{32,256}$/), sessionToken: z.string().regex(/^[A-Za-z0-9/+=]{1,16384}$/).optional() })

/** Explicit per-service file prevents accidental use of another AWS identity. */
export function readAwsCredentials(file: string) {
  try {
    const value = credentialsSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    return { accessKeyId: value.accessKeyId, secretAccessKey: value.secretAccessKey, ...(value.sessionToken ? { sessionToken: value.sessionToken } : {}) }
  }
  catch { throw new Error('AWS credential file is missing or invalid; contents withheld.') }
}
