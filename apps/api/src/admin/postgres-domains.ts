import { PrismaClient } from '../../generated/prisma/client.js'

import type { DomainWhitelistStore } from './routes.ts'

export function createPostgresDomainWhitelistStore(prisma: PrismaClient): DomainWhitelistStore {
  return {
    async list() {
      const rows = await prisma.allowedDomain.findMany({ orderBy: { createdAt: 'asc' } })
      return rows.map((r) => r.domain)
    },
    async add(domain) {
      await prisma.allowedDomain.upsert({
        create: { domain },
        update: {},
        where: { domain },
      })
    },
    async remove(domain) {
      await prisma.allowedDomain.deleteMany({ where: { domain } })
    },
  }
}
