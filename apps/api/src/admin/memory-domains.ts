import type { DomainWhitelistStore } from './routes.ts'

export function createMemoryDomainWhitelistStore(): DomainWhitelistStore {
  const domains = new Set<string>()
  return {
    async list() {
      return [...domains].sort()
    },
    async add(domain) {
      domains.add(domain)
    },
    async remove(domain) {
      domains.delete(domain)
    },
  }
}
