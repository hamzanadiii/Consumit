import type { AnimeAiringSchedule, AnimeAiringEpisode } from '@consumit/contracts'

export type AiringEntry = AnimeAiringEpisode & {
  isAired: boolean
  airDate: Date
}

export type AnimeAiringService = {
  getSchedule(schedule: AnimeAiringSchedule): AiringEntry[]
  getNextEpisode(schedule: AnimeAiringSchedule): AiringEntry | null
  getRecentlyAired(schedule: AnimeAiringSchedule, withinHours?: number): AiringEntry[]
}

export function createAnimeAiringService(): AnimeAiringService {
  return {
    getSchedule(schedule) {
      return schedule.episodes.map((ep) => ({
        ...ep,
        isAired: ep.timeUntilAiring <= 0,
        airDate: new Date(ep.airingAt),
      }))
    },

    getNextEpisode(schedule) {
      const entries = this.getSchedule(schedule)
      return entries.find((ep) => !ep.isAired) ?? null
    },

    getRecentlyAired(schedule, withinHours = 24) {
      const cutoff = Date.now() - withinHours * 60 * 60 * 1000
      return this.getSchedule(schedule).filter((ep) => ep.isAired && ep.airDate.getTime() >= cutoff)
    },
  }
}
