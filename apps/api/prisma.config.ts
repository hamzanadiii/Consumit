import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

if (process.env.DATABASE_DEPLOYMENT === 'self-hosted') {
  let valid = false
  try {
    const url = new URL(process.env.DATABASE_URL!)
    valid = url.hostname === 'postgres' && url.pathname === '/consumit' && url.username === 'consumit_migrate'
      && url.password.length >= 32 && !/consumit-local|replace[-_]|missing[-_]/i.test(url.password)
      && url.searchParams.get('sslmode') === 'verify-full' && url.searchParams.get('sslrootcert') === '/run/secrets/db-ca.crt'
      && [...url.searchParams].every(([key, value]) => key.toLowerCase() === 'sslmode' ? value === 'verify-full' : key.toLowerCase() === 'sslrootcert' ? value === '/run/secrets/db-ca.crt' : !['ssl', 'sslcert', 'sslkey', 'uselibpqcompat'].includes(key.toLowerCase()))
  } catch { /* Connection credentials must not appear in parser errors. */ }
  if (!valid) throw new Error('Self-hosted migrations require the dedicated migration role and certificate-verified TLS.')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
