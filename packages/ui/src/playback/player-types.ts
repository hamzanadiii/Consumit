export type PlayerMenuId = 'quality' | 'server' | 'settings' | 'subtitles' | 'sync' | 'playback' | 'audio' | 'appearance' | 'cast'

export type PlayerOption = {
  detail?: string | undefined
  label: string
  value: string
  /** ISO-3166 alpha-2 serving region; rendered as the server flag. */
  region?: string | undefined
  /** Breaker-derived serving state; shown, never blocking. */
  health?: 'ok' | 'degraded' | undefined
  /** Mirror family and mirror name. The server menu groups related choices. */
  family?: string | undefined
  mirror?: string | undefined
  /** False when this mirror did not answer for the title. A tap can retry it. */
  available?: boolean | undefined
  /** BCP-47-ish subtitle language code. Absent for Off. */
  language?: string | undefined
}

export type PlayerSubtitleCandidate = {
  id: string
  label: string
  language: string
  provider: string
  providerName?: string | undefined
  release?: string | undefined
  hi?: boolean | undefined
  forced?: boolean | undefined
  sdh?: boolean | undefined
  machineTranslated?: boolean | undefined
  preparedUrl?: string | undefined
}

export type PlayerSubtitleDiscovery = {
  searchId?: string | null | undefined
  languages: readonly { code: string; count: number }[]
  providers: readonly {
    id: string
    name: string
    state: 'ready' | 'skipped' | 'no_match' | 'failed' | 'timeout'
    durationMs: number
    found: number
    reason?: 'credentials_required' | 'unsupported' | undefined
  }[]
  loading: boolean
  error: string | null
}
