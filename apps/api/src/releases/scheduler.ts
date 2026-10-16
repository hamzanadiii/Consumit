import type { ReleaseEpisode } from '@consumit/contracts'
import type { ReleaseRepository } from './repository.ts'
import { recordCatalogRefresh, recordReleaseQueue } from './telemetry.ts'

export function createReleaseScheduler(repository: ReleaseRepository, catalog: (kind: 'series' | 'anime', id: number, now: Date) => Promise<ReleaseEpisode[]>,
  log: (event: { outcome: 'success' | 'failed' | 'queue'; episodes: number; catalogDue?: number; verificationDue?: number; queueAgeSeconds?: number }) => void, clock = () => new Date()) {
  let stopped = false, running: Promise<void> | undefined
  const runOnce = () => {
    if (running) return running
    running = (async () => {
      for (let i = 0; i < 25 && !stopped; i++) {
        const title = await repository.claimTitle()
        if (!title) break
        let episodes: ReleaseEpisode[] | null = null
        try { episodes = await catalog(title.catalogKind === 'SERIES' ? 'series' : 'anime', title.tmdbId, clock()) } catch { /* Preserve last known metadata. */ }
        await repository.refreshTitle(title, episodes)
        recordCatalogRefresh(episodes ? 'success' : 'failed')
        log({ outcome: episodes ? 'success' : 'failed', episodes: episodes?.length ?? 0 })
      }
      const queue = await repository.queueStats()
      recordReleaseQueue(queue.queueAgeSeconds)
      log({ outcome: 'queue', episodes: 0, ...queue })
    })().finally(() => { running = undefined })
    return running
  }
  let timer: ReturnType<typeof setInterval> | undefined
  return {
    runOnce,
    start() { stopped = false; if (timer) return; timer = setInterval(() => { void runOnce().catch(() => log({ outcome: 'failed', episodes: 0 })) }, 60_000); timer.unref(); void runOnce().catch(() => log({ outcome: 'failed', episodes: 0 })) },
    async stop() { stopped = true; if (timer) clearInterval(timer); timer = undefined; await running?.catch(() => undefined) },
  }
}
