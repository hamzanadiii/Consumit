import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://api.insertunit.ws'

export type TmdbIdentityResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<{ imdbId?: string; tmdbId?: number }>

export function createInsertunitProvider(http: ProviderHttp, identity: TmdbIdentityResolver, now = Date.now) {
  return adapter('insertunit', async (input, signal) => {
    const ids = await identity(input.ref, signal)
    if (!ids.imdbId) throw new ProviderFailure('empty')

    const pageUrl = `${origin}/embed/imdb/${ids.imdbId}`
    const page = await document(http, pageUrl, signal, { referer: `${origin}/` })

    const playerMatch = page.text.match(/makePlayer\s*\(\s*({[\s\S]*?})\s*\);/)
    if (!playerMatch) throw new ProviderFailure('empty')

    let config: any
    try {
      config = new Function(`return (${playerMatch[1]})`)()
    } catch {
      throw new ProviderFailure('empty')
    }

    if (config.blocked) throw new ProviderFailure('empty')

    let streamUrl: string | undefined
    let rawSubs: Array<{ url: string; name?: string }> | undefined

    if (input.ref.kind === 'movie') {
      const source = config.source
      if (!source) throw new ProviderFailure('empty')
      streamUrl = source.hls || source.dash
      rawSubs = source.cc
    } else {
      const targetSeason = input.ref.season
      const targetEpisode = input.ref.episode
      const seasons = config.playlist?.seasons
      if (!Array.isArray(seasons)) throw new ProviderFailure('empty')

      const foundSeason = seasons.find((s: any) => s.season === targetSeason)
      if (!foundSeason || foundSeason.blocked) throw new ProviderFailure('empty')

      const foundEp = (foundSeason.episodes || []).find((ep: any) => Number(ep.episode) === targetEpisode)
      if (!foundEp || foundEp.blocked) throw new ProviderFailure('empty')

      streamUrl = foundEp.hls || foundEp.dash
      rawSubs = foundEp.cc
    }

    if (!streamUrl) throw new ProviderFailure('empty')

    const type = mediaType(streamUrl)
    if (!type) throw new ProviderFailure('empty')

    const subtitles = (rawSubs || []).map((sub, idx) => ({
      id: `insertunit-sub-${idx}`,
      label: sub.name || `Subtitle ${idx + 1}`,
      language: (sub.name || 'und').toLowerCase().slice(0, 10),
      url: sub.url,
      format: (sub.url.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
    }))

    const source: ProviderSource = {
      key: 'insertunit:1080p',
      url: streamUrl,
      type,
      qualityHint: '1080p',
      expiresAt: accessDeadline(streamUrl, now()),
      language: 'multi',
      headers: { referer: `${origin}/` },
      subtitles,
    }

    return [source]
  })
}
