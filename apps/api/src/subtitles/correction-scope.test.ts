import { expect, it } from 'vitest'
import { createFakeSubtitlePreferences } from './preferences.ts'

it('isolates corrections by member, episode, recording and subtitle contents without applying legacy offsets', async () => {
  const preferences = createFakeSubtitlePreferences()
  const ref = { kind: 'series' as const, id: 1396, season: 1, episode: 1 }
  const scope = { videoVersion: `vv-${'a'.repeat(64)}`, contentChecksum: 'b'.repeat(64) }
  await preferences.set('alice', ref, { offsetMs: 5000 })
  expect(await preferences.get('alice', ref, scope)).toBeNull()
  await preferences.set('alice', ref, { offsetMs: 250 }, scope)
  expect(await preferences.get('alice', ref, scope)).toMatchObject({ offsetMs: 250 })
  expect(await preferences.get('alice', ref)).toMatchObject({ offsetMs: 5000 })
  expect(await preferences.get('bob', ref, scope)).toBeNull()
  expect(await preferences.get('alice', { ...ref, episode: 2 }, scope)).toBeNull()
  expect(await preferences.get('alice', ref, { ...scope, videoVersion: `vv-${'c'.repeat(64)}` })).toBeNull()
  expect(await preferences.get('alice', ref, { ...scope, contentChecksum: 'd'.repeat(64) })).toBeNull()
})
