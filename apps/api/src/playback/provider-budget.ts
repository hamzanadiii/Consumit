import { randomUUID } from 'node:crypto'
import type { ProviderRegistration } from '@consumit/provider-sdk'
import type { PlaybackStore } from './state.ts'

/** Shared admission only. Synthetic work never updates playback health. */
export async function acquireProviderBudget(provider: ProviderRegistration, region: string, store?: PlaybackStore): Promise<(() => Promise<void>) | null> {
  if (!store) return async () => {}
  const key = `provider-budget:v1:${region}:${provider.upstreamGroup}`
  const token = randomUUID(), mutex = `${key}:lock`
  if (!await store.claim(mutex, token, 2)) return null
  try {
    const now = Date.now()
    const raw = await store.get(key)
    const prior: { at: number; count: number; slots: { token: string; until: number }[] } = raw ? JSON.parse(raw) : { at: now, count: 0, slots: [] }
    const slots = prior.slots.filter(slot => slot.until > now)
    const count = prior.at + 60_000 > now ? prior.count : 0
    if (count >= provider.requestsPerMinute || slots.length >= provider.concurrency) return null
    slots.push({ token, until: now + 20_000 })
    await store.set(key, JSON.stringify({ at: count ? prior.at : now, count: count + 1, slots }), 80)
  } finally { await store.release(mutex, token) }
  return async () => {
    if (!await store.claim(mutex, token, 2)) return // Expiring admission bounds a missed release.
    try {
      const raw = await store.get(key)
      if (raw) { const value = JSON.parse(raw); value.slots = value.slots.filter((slot: { token: string }) => slot.token !== token); await store.set(key, JSON.stringify(value), 80) }
    } finally { await store.release(mutex, token) }
  }
}
