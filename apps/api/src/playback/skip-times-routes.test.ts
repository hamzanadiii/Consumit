import Fastify from 'fastify'
import { expect, it, vi } from 'vitest'
import { registerErrorHandlers } from '../http/errors.ts'
import { registerSkipTimesRoutes } from './skip-times-routes.ts'

it('requires an exact episode and bounds runtime before calling the timing adapter', async () => {
  const app = Fastify()
  const read = vi.fn(async () => [{ kind: 'intro' as const, start: 10, end: 90 }])
  registerErrorHandlers(app)
  registerSkipTimesRoutes(app, { read })
  try {
    const valid = await app.inject('/v1/playback/skip-times?kind=series&id=1396&season=1&episode=1&duration=3480')
    expect(valid.statusCode).toBe(200)
    expect(valid.json()).toEqual({ segments: [{ kind: 'intro', start: 10, end: 90 }] })
    expect(read).toHaveBeenCalledWith({ kind: 'series', id: 1396, season: 1, episode: 1 }, 3480)
    for (const query of ['kind=series&id=1396&duration=3480', 'kind=anime&id=21&duration=1440', 'kind=movie&id=550&duration=0', 'kind=movie&id=550&duration=Infinity', 'kind=movie&id=-1&duration=100']) {
      expect((await app.inject(`/v1/playback/skip-times?${query}`)).statusCode).toBe(400)
    }
    expect(read).toHaveBeenCalledTimes(1)
    const special = await app.inject('/v1/playback/skip-times?kind=series&id=1396&season=0&episode=1&duration=3480')
    expect(special.statusCode).toBe(200)
    expect(read).toHaveBeenLastCalledWith({ kind: 'series', id: 1396, season: 0, episode: 1 }, 3480)
  } finally { await app.close() }
})
