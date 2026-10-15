import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { replaceProviderSettings } from './provider-settings-transfer.ts'

// Temporary tables on one connection shadow the shared schema. The test never
// replaces settings belonging to another suite or a development member.
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const row = (id: string) => ({ adapter: 'static', id, enabled: true, regions: ['US'], mediaHosts: ['media.example'], entries: [] })
const transfer = { version: 1, base: [row('first'), row('second')], overrides: { first: { enabled: false, order: { movie: 1 } }, second: { role: 'both', deliveryMode: 'relay', order: { movie: 0 } } } }

beforeAll(async () => {
  await db.connect()
  for (const table of ['ProviderOverride', 'ProviderConfigRevision', 'ProviderChange']) await db.query(`CREATE TEMP TABLE "${table}" (LIKE public."${table}" INCLUDING ALL)`)
})
afterAll(async () => { await db.end() })

describe('atomic private provider synchronization', () => {
  it('replaces stale settings, audits removals, and updates the shared revision once', async () => {
    await db.query('INSERT INTO "ProviderOverride" (id, "configJson", revision, "updatedAt") VALUES ($1, $2, 7, NOW())', ['retired', '{"enabled":true}'])
    await db.query('INSERT INTO "ProviderConfigRevision" (id, revision, "updatedAt") VALUES (1, 10, NOW())')
    await replaceProviderSettings(db, transfer)
    const stored = await db.query('SELECT id, "configJson" FROM "ProviderOverride" ORDER BY id')
    expect(Object.fromEntries(stored.rows.map(r => [r.id, JSON.parse(r.configJson)]))).toEqual(transfer.overrides)
    expect((await db.query('SELECT revision FROM "ProviderConfigRevision" WHERE id=1')).rows[0].revision).toBe(11)
    expect((await db.query('SELECT "beforeJson", "afterJson" FROM "ProviderChange" WHERE "providerId"=$1', ['retired'])).rows).toEqual([{ beforeJson: '{"enabled":true}', afterJson: 'null' }])
  })
  it('rolls back settings, audit and revision together when persistence fails', async () => {
    const before = await db.query('SELECT * FROM "ProviderOverride" ORDER BY id')
    const audit = (await db.query('SELECT count(*) FROM "ProviderChange"')).rows[0].count
    await db.query('ALTER TABLE "ProviderOverride" ADD CONSTRAINT fail_transfer CHECK (id <> \'broken\')')
    await expect(replaceProviderSettings(db, { version: 1, base: [row('broken')], overrides: { broken: { enabled: true } } })).rejects.toThrow()
    expect((await db.query('SELECT * FROM "ProviderOverride" ORDER BY id')).rows).toEqual(before.rows)
    expect((await db.query('SELECT count(*) FROM "ProviderChange"')).rows[0].count).toBe(audit)
    expect((await db.query('SELECT revision FROM "ProviderConfigRevision" WHERE id=1')).rows[0].revision).toBe(11)
  })
})
