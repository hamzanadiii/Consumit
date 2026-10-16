import { createHash } from 'node:crypto'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://mapple.rip'
const headers = { referer: `${origin}/` }

export function createMappleProvider(http: ProviderHttp, now = Date.now) {
  return adapter('mapple', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const pageUrl = isTv ? `${origin}/watch/tv/${ref.id}` : `${origin}/watch/movie/${ref.id}`

    let jar = ''
    const storeCookies = (resHeaders?: Headers) => {
      if (!resHeaders) return
      const getSetCookie = typeof resHeaders.getSetCookie === 'function' ? resHeaders.getSetCookie() : []
      const list = getSetCookie?.length ? getSetCookie : (typeof resHeaders.get === 'function' && resHeaders.get('set-cookie') ? [resHeaders.get('set-cookie')] : [])
      for (const c of list) {
        if (!c) continue
        const pair = c.split(';')[0]?.trim()
        if (!pair) continue
        const name = pair.split('=')[0]
        const parts = jar ? jar.split('; ').filter((p: string) => !p.startsWith(name + '=')) : []
        parts.push(pair)
        jar = parts.join('; ')
      }
    }
    const withCookies = (extra: Record<string, string> = {}) => ({
      ...headers,
      origin,
      ...(jar ? { cookie: jar } : {}),
      ...extra,
    })

    const page = await document(http, pageUrl, signal, withCookies())
    storeCookies(page.headers)
    const tokenMatch = page.text.match(/window\.__REQUEST_TOKEN__\s*=\s*"([^"]+)"/)
    if (!tokenMatch) throw new ProviderFailure('empty')
    const requestToken = tokenMatch[1]
    if (!requestToken) throw new ProviderFailure('empty')

    const tvSlug = isTv ? `${ref.season}-${ref.episode}` : ''
    const initPayload: Record<string, unknown> = {
      mediaId: ref.id,
      mediaType: isTv ? 'tv' : 'movie',
      tv_slug: tvSlug,
      requestToken,
    }

    const initRes = await document(
      http,
      `${origin}/api/playback-init`,
      signal,
      withCookies({ 'content-type': 'application/json' }),
      { method: 'POST', body: JSON.stringify(initPayload) },
    )
    storeCookies(initRes.headers)

    let initData = JSON.parse(initRes.text)
    if (initData?.requiresPow && initData?.pow) {
      const { challengeId, challenge, difficulty } = initData.pow
      const target = BigInt(1) << BigInt(256 - Number(difficulty))
      let nonce = 0
      for (;;) {
        const hash = createHash('sha256').update(challenge + nonce).digest('hex')
        if (BigInt('0x' + hash) < target) break
        nonce++
        if (nonce > 5000000) throw new ProviderFailure('unavailable')
      }

      const powPayload = { ...initPayload, challengeId, nonce, pow: { challengeId, nonce } }
      const powRes = await document(
        http,
        `${origin}/api/playback-init`,
        signal,
        withCookies({ 'content-type': 'application/json' }),
        { method: 'POST', body: JSON.stringify(powPayload) },
      )
      storeCookies(powRes.headers)
      initData = JSON.parse(powRes.text)
    }

    const streamToken = initData?.token
    if (!initData?.success || !streamToken) throw new ProviderFailure('empty')

    const encRes = await document(
      http,
      `${origin}/api/encrypt`,
      signal,
      withCookies({ 'content-type': 'application/json' }),
      {
        method: 'POST',
        body: JSON.stringify({
          data: { mediaId: ref.id, mediaType: isTv ? 'tv' : 'movie', tv_slug: tvSlug, source: 'mapple' },
          endpoint: 'stream-encrypted',
          requestToken,
        }),
      },
    )
    storeCookies(encRes.headers)

    const encData = JSON.parse(encRes.text)
    if (!encData?.url) throw new ProviderFailure('empty')

    const encUrl = encData.url.startsWith('http') ? encData.url : `${origin}${encData.url}`
    const sep = encUrl.includes('?') ? '&' : '?'
    const streamEndpoint = `${encUrl}${sep}requestToken=${encodeURIComponent(requestToken)}&token=${encodeURIComponent(streamToken)}`

    const finalRes = await document(http, streamEndpoint, signal, withCookies())
    storeCookies(finalRes.headers)
    const finalData = JSON.parse(finalRes.text)
    const streamUrl = finalData?.data?.stream_url
    if (!finalData?.success || !streamUrl) throw new ProviderFailure('empty')

    const manifestRes = await document(http, streamUrl, signal, { ...headers, origin })
    if (!manifestRes.text.includes('#EXTM3U')) throw new ProviderFailure('empty')

    let height: number | undefined
    let qualityHint = 'Auto'
    const resMatch = manifestRes.text.match(/RESOLUTION=\d+x(\d+)/i)
    const heightText = resMatch?.[1]
    if (heightText) {
      height = Number.parseInt(heightText, 10)
      qualityHint = `${height}p`
    }

    const key = height ? `mapple:${qualityHint.toLowerCase()}` : 'mapple:auto'

    const source: ProviderSource = {
      key,
      url: streamUrl,
      type: 'hls',
      expiresAt: accessDeadline(streamUrl, now()),
      language: 'original',
      headers: { referer: `${origin}/`, origin },
      subtitles: [],
      qualityHint,
      ...(height ? { height } : {}),
    }

    return [source]
  })
}
