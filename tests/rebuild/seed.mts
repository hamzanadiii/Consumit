import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDbClient } from '../../apps/api/src/db/client.ts'
import { hashPassword } from '../../apps/api/src/identity/password.ts'

export async function seedRebuildMember(database = process.env.DATABASE_URL) {
  if (!database) throw new Error('Use a dedicated test database.')
  const url = new URL(database)
  if (!url.pathname.endsWith('_test') || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Seed only the local rebuild/CI test database.')
  const db = createDbClient(database)
  try {
    const email = 'rebuild-browser@example.test'
    await db.prisma.member.deleteMany({ where: { email } })
    await db.prisma.member.create({ data: { email, emailVerifiedAt: new Date(), credential: { create: { passwordHash: await hashPassword('RebuildBrowserPassword123!') } }, profile: { create: { username: 'rebuild_browser', visibility: 'private' } } } })
  } finally { await db.close() }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await seedRebuildMember()
