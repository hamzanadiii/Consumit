import { createDecipheriv } from 'node:crypto'
import type { SubtitleHttp } from './http.ts'
import { knownLang, normLang } from './lang.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// CastleSubs harvester ported from PROVE — the same chain as the Castle
// stream provider, but only the getVideo2 subtitle arrays are kept (videos
// ignored). Keyless, no quotas: security-key -> search -> details (+season)
// -> getVideo2 per audio track (720p carries the same subtitles as the
// permission-gated 1080p) -> direct subtitle file URLs. Movies + TV +
// anime (title-keyed; anime rides the TV path with the mapped season and
// the absolute episode, falling back to season 1 when the bridge misses).

const CASTLE_BASE = 'https://api.hlowb.com'
const PKG = 'com.external.castle'
const CHANNEL = 'IndiaA'
const CLIENT = '1'
const LANG = 'en-US'

const API_HEADERS: Record<string, string> = {
  'User-Agent': 'okhttp/4.9.3',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: CASTLE_BASE,
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function castleSafeParse(text: string): unknown {
  return JSON.parse(text.replace(/([:{[,]\s*)(\d{16,})/g, '$1"$2"'))
}

function deriveKey(securityKey: string): Buffer {
  const keyBytes = Buffer.from(securityKey, 'base64')
  const suffix = Buffer.from('T!BgJB', 'utf8')
  const combined = Buffer.concat([keyBytes, suffix])
  if (combined.length < 16) return Buffer.concat([combined, Buffer.alloc(16 - combined.length, 0)])
  return combined.subarray(0, 16)
}

function decryptCastle(cipherText: string, securityKey: string): string {
  const key = deriveKey(securityKey)
  const decipher = createDecipheriv('aes-128-cbc', key, key)
  const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

type JsonRecord = Record<string, unknown>

function unwrap(obj: unknown): JsonRecord {
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && 'data' in obj) {
    const data = (obj as { data: unknown }).data
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as JsonRecord
  }
  return (obj ?? {}) as JsonRecord
}

function asRows(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : []
}

export function createCastleSubsProvider(http: SubtitleHttp): SubtitleSearchProvider {
  async function castleGet(path: string, signal: AbortSignal): Promise<string> {
    const { text } = await http.get(`${CASTLE_BASE}${path}`, API_HEADERS, signal)
    return text
  }

  async function extractCipher(text: string): Promise<string> {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('Castle response empty.')
    try {
      const parsed = JSON.parse(trimmed) as { data?: unknown }
      if (typeof parsed.data === 'string') return parsed.data.trim()
    } catch {
      // Raw cipher body.
    }
    return trimmed
  }

  return {
    id: 'castlesubs',
    name: 'CastleSubs',
    supports(query: SubtitleQuery) {
      return (query.type === 'movie' || query.type === 'tv' || query.type === 'anime') && !!query.title
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      const title = query.title!.trim()
      const isTv = query.type !== 'movie'
      const season = Number(query.season ?? 1)
      const episode = Number(query.episode ?? 1)

      const secKey: string = await castleGet(
        `/v0.1/system/getSecurityKey/1?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}`,
        signal,
      ).then((text) => {
        const parsed = JSON.parse(text) as { code?: number; data?: unknown }
        if (parsed.code !== 200 || !parsed.data) throw new Error('Castle security key failed.')
        return String(parsed.data)
      })

      const keyword = query.year ? `${title} ${query.year}` : title
      const params = new URLSearchParams({
        channel: CHANNEL, clientType: CLIENT, keyword, lang: LANG,
        mode: '1', packageName: PKG, page: '1', size: '30',
      })
      const searchRaw = castleSafeParse(
        decryptCastle(await extractCipher(await castleGet(`/film-api/v1.1.0/movie/searchByKeyword?${params}`, signal)), secKey),
      )
      const rows = asRows(unwrap(searchRaw).rows)
      if (!rows.length) throw new Error('Castle search returned nothing.')
      const titleLc = title.toLowerCase()
      const match = rows.find((row) => {
        const name = String(row.title || row.name || '').toLowerCase()
        return name.includes(titleLc) || titleLc.includes(name)
      }) || rows[0]!
      const castleId = String(match.id || match.redirectId || match.redirectIdStr || '')
      if (!castleId) throw new Error('Castle title id missing.')

      let details = unwrap(
        castleSafeParse(
          decryptCastle(
            await extractCipher(
              await castleGet(`/film-api/v1.9.9/movie?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}&movieId=${castleId}&packageName=${PKG}`, signal),
            ),
            secKey,
          ),
        ),
      )
      let activeId = castleId
      if (isTv) {
        const seasonEntry = asRows(details.seasons).find((entry) => entry.number === season)
        if (seasonEntry?.movieId && String(seasonEntry.movieId) !== castleId) {
          activeId = String(seasonEntry.movieId)
          details = unwrap(
            castleSafeParse(
              decryptCastle(
                await extractCipher(
                  await castleGet(`/film-api/v1.9.9/movie?channel=${CHANNEL}&clientType=${CLIENT}&lang=${LANG}&movieId=${activeId}&packageName=${PKG}`, signal),
                ),
                secKey,
              ),
            ),
          )
        }
      }
      const episodes = asRows(details.episodes)
      const epEntry = isTv ? episodes.find((entry) => entry.number === episode) : episodes[0]
      if (!epEntry) throw new Error('Castle episode missing.')
      const episodeId = epEntry.id != null ? String(epEntry.id) : null
      if (!episodeId) throw new Error('Castle episode missing.')

      const tracks = asRows(epEntry.tracks).filter((track) => track.existIndividualVideo !== false)
      const langTracks = tracks.length ? tracks : [{ languageId: '', languageName: '', abbreviate: '' }]

      const out: RawSubtitle[] = []
      const seen = new Set<string>()
      const videoUrl = `${CASTLE_BASE}/film-api/v2.0.1/movie/getVideo2?clientType=${CLIENT}&packageName=${PKG}&channel=${CHANNEL}&lang=${LANG}`
      await Promise.allSettled(
        langTracks.map(async (track: JsonRecord) => {
          const text = await http.post(
            videoUrl,
            JSON.stringify({
              mode: '1', appMarket: 'GuanWang', clientType: CLIENT, woolUser: 'false',
              apkSignKey: 'ED0955EB084E67A1D9F3305B95454FED485261475',
              androidVersion: '13', movieId: activeId, episodeId,
              isNewUser: 'true', packageName: PKG,
              ...(track.languageId ? { languageId: String(track.languageId), resolution: '2' } : { resolution: '2' }),
            }),
            API_HEADERS,
            signal,
          )
          const data = unwrap(castleSafeParse(decryptCastle(await extractCipher(text), secKey)))
          for (const sub of asRows(data.subtitles)) {
            const url = String(sub?.url || '').replace(/ /g, '%20')
            if (!/^https?:\/\//.test(url) || seen.has(url)) continue
            seen.add(url)
            // Upstream labels are unreliable ([ar] Albanian for Arabic.vtt):
            // derive the language from the file name when it names one.
            const fileLang = url.match(/\/([A-Za-z]+)\.(vtt|srt)(\?|#|$)/)?.[1] || ''
            const filenameLanguage = knownLang(fileLang)
            const lang = filenameLanguage ?? normLang(String(sub?.abbreviate || sub?.language || sub?.title || 'en'))
            out.push({
              url,
              lang,
              label: (filenameLanguage ? fileLang : String(sub?.title || sub?.abbreviate || 'subtitle')).slice(0, 64),
              format: /\.vtt(\?|#|$)/i.test(url) ? 'vtt' : /\.srt(\?|#|$)/i.test(url) ? 'srt' : 'srt',
              provider: 'castlesubs',
              headers: {
                'User-Agent': UA,
                Referer: CASTLE_BASE,
              },
            })
          }
        }),
      )
      return out
    },
  }
}
