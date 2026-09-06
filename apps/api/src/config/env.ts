import { z } from 'zod'

const envSchema = z.object({
  ADDITIONAL_ORIGINS: z.string().trim().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  TMDB_API_READ_TOKEN: z.string().trim().min(1).optional(),
  TMDB_LANGUAGE: z.string().trim().min(1).default('en-US'),
  TMDB_REGION: z.string().trim().min(1).default('US'),
  WEB_ORIGIN: z.string().trim().min(1).default('http://localhost:3000'),
})

export type ApiEnv = {
  additionalOrigins: string[]
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  tmdbLanguage: string
  tmdbRegion: string
  tmdbToken: string | undefined
  webOrigin: string
}

/**
 * Parse and validate process configuration once at boot. Structural problems
 * fail fast; a missing TMDB token only degrades catalog routes (they answer
 * 503) so health and future non-catalog modules keep serving.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(`Invalid API configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  const env = parsed.data
  return {
    additionalOrigins: (env.ADDITIONAL_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    tmdbLanguage: env.TMDB_LANGUAGE,
    tmdbRegion: env.TMDB_REGION,
    tmdbToken: env.TMDB_API_READ_TOKEN,
    webOrigin: env.WEB_ORIGIN,
  }
}
