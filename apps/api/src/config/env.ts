import { z } from 'zod'

const envSchema = z.object({
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  AUTH_CODE_PEPPER: z.string().min(32).optional(),
  AUTH_EMAIL_FROM: z.string().trim().min(3).optional(),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_SSL_MODE: z.enum(['disable', 'require']).default('disable'),
  DATABASE_URL: z.string().trim().min(1).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  TMDB_API_READ_TOKEN: z.string().trim().min(1).optional(),
  TMDB_LANGUAGE: z.string().trim().min(1).default('en-US'),
  TMDB_REGION: z.string().trim().length(2).default('US'),
  TRUSTED_PROXIES: z.string().optional(),
  VALKEY_URL: z.string().trim().min(1).optional(),
})

export type ApiEnv = {
  appOrigin: string
  authCodePepper: string | undefined
  authEmailFrom: string | undefined
  databaseSslCa: string | undefined
  databaseSslMode: 'disable' | 'require'
  databaseUrl: string | undefined
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  resendApiKey: string | undefined
  tmdbLanguage: string
  tmdbRegion: string
  tmdbToken: string | undefined
  trustedProxies: string[]
  valkeyUrl: string | undefined
}

export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(`Invalid API configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  const value = parsed.data
  if (value.NODE_ENV === 'production') {
    const required = {
      AUTH_CODE_PEPPER: value.AUTH_CODE_PEPPER,
      AUTH_EMAIL_FROM: value.AUTH_EMAIL_FROM,
      DATABASE_URL: value.DATABASE_URL,
      RESEND_API_KEY: value.RESEND_API_KEY,
      TMDB_API_READ_TOKEN: value.TMDB_API_READ_TOKEN,
      VALKEY_URL: value.VALKEY_URL,
    }
    const missing = Object.entries(required).filter(([, entry]) => !entry).map(([name]) => name)
    if (missing.length) throw new Error(`Invalid API configuration: ${missing.join(', ')} required in production.`)
    if (value.DATABASE_SSL_MODE !== 'require') {
      throw new Error('Invalid API configuration: DATABASE_SSL_MODE=require is required in production.')
    }
  }
  return {
    appOrigin: value.APP_ORIGIN.replace(/\/$/, ''),
    authCodePepper: value.AUTH_CODE_PEPPER,
    authEmailFrom: value.AUTH_EMAIL_FROM,
    databaseSslCa: value.DATABASE_SSL_CA?.replaceAll('\\n', '\n'),
    databaseSslMode: value.DATABASE_SSL_MODE,
    databaseUrl: value.DATABASE_URL,
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    resendApiKey: value.RESEND_API_KEY,
    tmdbLanguage: value.TMDB_LANGUAGE,
    tmdbRegion: value.TMDB_REGION.toUpperCase(),
    tmdbToken: value.TMDB_API_READ_TOKEN,
    trustedProxies: (value.TRUSTED_PROXIES ?? '').split(',').map((entry) => entry.trim()).filter(Boolean),
    valkeyUrl: value.VALKEY_URL,
  }
}
