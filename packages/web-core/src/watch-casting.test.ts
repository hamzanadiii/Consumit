import { playbackSessionSchema } from '@consumit/contracts'
import { afterEach, expect, it, vi } from 'vitest'
import { createCastSender } from './lib/cast-sender'
import { loadWatchCastMedia } from './watch-casting'

const expiresAt = '2099-01-01T00:00:00.000Z'
const session = playbackSessionSchema.parse({
  id: '00000000-0000-4000-8000-000000000001', ref: { kind: 'movie', id: 1 }, expiresAt, fallbackCount: 0,
  capabilities: { refresh: true, fallback: true, externalSubtitles: true },
  source: { id: 'source', providerId: 'provider', type: 'hls', delivery: 'relay', src: 'https://consumit.online/media/browser-grant', expiresAt },
})
const state = { title: 'Fixture', audioLanguage: 'en', position: 42, playing: false }
afterEach(() => vi.unstubAllGlobals())
it('hands the receiver a nonce while keeping the browser grant private', async () => {
  const sender = createCastSender()
  const load = vi.spyOn(sender, 'loadMedia').mockResolvedValue(undefined)
  const fetch = vi.fn().mockResolvedValue(Response.json({ handoffToken: 'a'.repeat(64) }))
  vi.stubGlobal('fetch', fetch)
  await loadWatchCastMedia(sender, session, state)
  expect(load).toHaveBeenCalledWith(expect.objectContaining({
    contentId: `${window.location.origin}/cast/relay`, position: 42, playing: false,
    customData: expect.objectContaining({ delivery: 'relay', handoffToken: 'a'.repeat(64) }),
  }))
  expect(JSON.stringify(load.mock.calls)).not.toContain('browser-grant')
  expect(fetch).toHaveBeenCalledWith(`/v1/playback/${session.id}/cast-handoff`, expect.objectContaining({ credentials: 'same-origin' }))
})
it('keeps direct casting independent of handoff authorization', async () => {
  const sender = createCastSender()
  const load = vi.spyOn(sender, 'loadMedia').mockResolvedValue(undefined)
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const direct = { ...session, source: { ...session.source, delivery: 'direct' as const, src: 'https://provider.example/movie.m3u8' } }
  await loadWatchCastMedia(sender, direct, state)
  expect(load).toHaveBeenCalledWith(expect.objectContaining({ contentId: direct.source.src }))
  expect(fetch).not.toHaveBeenCalled()
})
it('never loads an unprotected fallback after pairing fails', async () => {
  const sender = createCastSender()
  const load = vi.spyOn(sender, 'loadMedia').mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))
  await expect(loadWatchCastMedia(sender, session, state)).rejects.toThrow('TV authorization failed')
  expect(load).not.toHaveBeenCalled()
})
