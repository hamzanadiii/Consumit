import { afterAll, describe, expect, it } from 'vitest'
import { createDbClient } from '../db/client.ts'
import { createPostgresProviderConfigStore } from './postgres-provider-config.ts'

const db = createDbClient(process.env.DATABASE_URL!)
const id = `integration-provider-${Date.now()}`
afterAll(async () => {
  await db.prisma.providerChange.deleteMany({ where: { providerId: id } })
  await db.prisma.providerOverride.deleteMany({ where: { id } })
  await db.close()
})

describe('durable provider controls', () => {
  it('propagates committed changes and records actor, before, and after', async () => {
    const first = createPostgresProviderConfigStore(db.prisma)
    const second = createPostgresProviderConfigStore(db.prisma)
    const revision = await first.getRevision!()
    await first.setOverride(id, { enabled: false, concurrency: 2 }, 'operator-one')
    expect(await second.getOverride(id)).toMatchObject({ enabled: false, concurrency: 2 })
    expect(await second.getRevision!()).toBeGreaterThan(revision)
    await second.setOverride(id, { concurrency: 1 }, 'operator-two')
    expect(await first.getOverride(id)).toMatchObject({ enabled: false, concurrency: 1 })
    const changes = await first.listChanges!(100)
    expect(changes.filter((entry) => entry.providerId === id)).toMatchObject([
      { actorId: 'operator-two', before: { enabled: false, concurrency: 2 }, after: { enabled: false, concurrency: 1 } },
      { actorId: 'operator-one', before: null, after: { enabled: false, concurrency: 2 } },
    ])
    await first.removeOverride(id, 'operator-one')
    expect(await second.getOverride(id)).toBeUndefined()
  })
  it('saves a complete kind order atomically and rejects a stale revision', async () => {
    const first = createPostgresProviderConfigStore(db.prisma)
    const second = createPostgresProviderConfigStore(db.prisma)
    const revision = await first.getRevision!()
    expect(await first.setOrder!('movie', [id], revision, 'operator-one')).toBe(true)
    expect(await second.getOverride(id)).toMatchObject({ order: { movie: 0 } })
    expect(await second.setOrder!('movie', [id], revision, 'operator-two')).toBe(false)
    expect(await second.getRevision!()).toBe(revision + 1)
    await first.setOverride(id, { enabled: false }, 'operator-one')
    await first.removeOverride(id, 'operator-one')
    expect(await second.getOverride(id)).toEqual({ order: { movie: 0 } })
  })
})
