import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'
import type { TmdbIdentityResolver } from './insertunit.ts'

const origin = 'https://cinehd.vc'

export function createCinehdProvider(http: ProviderHttp, identity: TmdbIdentityResolver, now = Date.now) {
  return adapter('cinehd', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const ids = await identity(ref, signal).catch(() => ({} as any))
    const idVal = isTv ? ref.id : (ids?.imdbId || ids?.tmdbId || ref.id)

    const embedUrl = `${origin}/api/hdmovies/embed?type=${isTv ? 'tv' : 'movie'}&id=${idVal}`
    let embedRes: { text: string }
    try {
      embedRes = await document(http, embedUrl, signal, { referer: `${origin}/` })
    } catch {
      throw new ProviderFailure('empty')
    }

    const iframeMatch = embedRes.text.match(/<iframe[^>]+src=["']([^"']+)["']/)
    if (!iframeMatch) throw new ProviderFailure('empty')

    const playUrl = iframeMatch[1]
    let playRes: { text: string }
    try {
      playRes = await document(http, playUrl, signal, { referer: `${origin}/` })
    } catch {
      throw new ProviderFailure('empty')
    }

    let playData: { file?: string; key?: string }
    try {
      playData = JSON.parse(playRes.text)
    } catch {
      throw new ProviderFailure('empty')
    }

    if (!playData.file || !playData.key) throw new ProviderFailure('empty')

    const playParsed = new URL(playUrl)
    const playOrigin = playParsed.origin
    const csrfKey = playData.key

    const playlistUrl = playData.file.startsWith('http') ? playData.file : `${playOrigin}${playData.file.startsWith('/') ? '' : '/'}${playData.file}`
    let playlistRes: { text: string }
    try {
      playlistRes = await document(http, playlistUrl, signal, {
        method: 'POST',
        headers: {
          referer: playUrl,
          'x-csrf-token': csrfKey,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: '',
      })
    } catch {
      throw new ProviderFailure('empty')
    }

    let items: Array<{ title?: string; file?: string }>
    try {
      items = JSON.parse(playlistRes.text)
    } catch {
      throw new ProviderFailure('empty')
    }

    if (!Array.isArray(items) || !items.length) throw new ProviderFailure('empty')

    const sources: ProviderSource[] = []

    for (const item of items) {
      if (!item.file) continue
      const token = item.file.startsWith('~') ? item.file.slice(1) : item.file
      const tokenUrl = `${playOrigin}/playlist/${token}.txt`

      let finalRes: { text: string }
      try {
        finalRes = await document(http, tokenUrl, signal, {
          method: 'POST',
          headers: {
            referer: playUrl,
            'x-csrf-token': csrfKey,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: '',
        })
      } catch {
        continue
      }

      const rawUrls = finalRes.text.trim().split(/\s+/).filter(Boolean)
      for (const u of rawUrls) {
        if (!u.startsWith('http')) continue
        const type = mediaType(u) || 'hls'
        const qualityHint = item.title || 'Auto'
        sources.push({
          key: `cinehd:${qualityHint.toLowerCase()}:${sources.length}`,
          url: u,
          type,
          qualityHint,
          expiresAt: accessDeadline(u, now()),
          language: 'original',
          headers: { referer: `${origin}/` },
          subtitles: [],
        })
      }
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
