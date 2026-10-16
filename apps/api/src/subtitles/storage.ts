import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PlaybackStore } from '../playback/state.ts'

/** Where a converted track lives: `tmdb/movie/550/1/1/en` or `anime/21/7/en`.
 *  Derived from the subtitle query, never from provider state — the same
 *  content always maps to the same directory no matter who resolved it. */
export function contentPath(query: { type: string; tmdbId?: number | undefined; anilistId?: number | undefined; season?: number | undefined; episode?: number | undefined }, lang: string): string {
  const safeLang = /^[a-z]{2,3}$/.test(lang) ? lang : 'und'
  if (query.type === 'anime') {
    const id = Number.isInteger(query.anilistId) && (query.anilistId as number) > 0 ? query.anilistId : 0
    const ep = Number.isInteger(query.episode) && (query.episode as number) > 0 ? query.episode : 1
    return join('anime', String(id), String(ep), safeLang)
  }
  const id = Number.isInteger(query.tmdbId) && (query.tmdbId as number) > 0 ? query.tmdbId : 0
  const season = Number.isInteger(query.season) && (query.season as number) > 0 ? query.season : 1
  const episode = Number.isInteger(query.episode) && (query.episode as number) > 0 ? query.episode : 1
  const kind = query.type === 'tv' ? 'tv' : 'movie'
  return join('tmdb', kind, String(id), String(season), String(episode), safeLang)
}

export type OriginalFile = { bytes: Buffer; ext: 'srt' | 'vtt' | 'ass' | 'ssa' }

export interface SubtitleFileStore {
  getVtt(key: string): Promise<string | null>
  putVtt(key: string, vtt: string, opts: { content: string; ttlSeconds: number }): Promise<void>
  getOriginal(key: string): Promise<OriginalFile | null>
  putOriginal(key: string, file: OriginalFile, opts: { content: string; ttlSeconds: number }): Promise<void>
}

function validKey(key: string): boolean {
  return /^[0-9a-f]{16}$/.test(key)
}

/** Store-backed files (Valkey/memory): converted VTT only, same behavior as
 *  today. Originals are unavailable on this backend (null / no-op). */
export function createStoreFileStore(store: PlaybackStore): SubtitleFileStore {
  return {
    async getVtt(key: string) {
      if (!validKey(key)) return null
      try {
        const raw = await store.get(`subvtt:${key}`)
        if (!raw) return null
        const parsed = JSON.parse(raw) as { vtt?: unknown }
        return typeof parsed.vtt === 'string' ? parsed.vtt : null
      } catch {
        return null
      }
    },
    async putVtt(key: string, vtt: string, opts: { ttlSeconds: number }) {
      if (!validKey(key)) return
      try {
        await store.set(`subvtt:${key}`, JSON.stringify({ vtt }), opts.ttlSeconds)
      } catch {
        // Cache failure never fails the search.
      }
    },
    async getOriginal() {
      return null
    },
    async putOriginal() {
      // Originals need a disk backend; the converted VTT above still stands.
    },
  }
}

const INDEX_TTL_SECONDS = 7 * 24 * 3600

/** VPS-disk files: converted VTT plus the original source bytes (srt/vtt/
 *  ass) side by side under <dir>/<content>/<key>.{vtt,orig.ext}. A tiny
 *  key→content index rides on the PlaybackStore so reads stay O(1); an
 *  index miss reads as a miss (the next search re-discovers and re-indexes).
 *  TTL is enforced lazily on read via mtime, with expired files removed on
 *  access. All path segments are validated — keys are hex, content comes
 *  from numeric query fields — so traversal is impossible. */
export function createDiskFileStore(dir: string, index: PlaybackStore): SubtitleFileStore {
  const root = dir.replace(/\/$/, '')

  async function locate(key: string): Promise<{ directory: string } | null> {
    let content: string
    try {
      const raw = await index.get(`subvtt:path:${key}`)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { content?: unknown }
      if (typeof parsed.content !== 'string' || parsed.content.includes('..')) return null
      content = parsed.content
    } catch {
      return null
    }
    return { directory: join(root, content) }
  }

  async function readFresh(path: string, ttlSeconds: number): Promise<Buffer | null> {
    let mtime: Date
    try {
      mtime = (await stat(path)).mtime
    } catch {
      return null
    }
    if (Date.now() - mtime.getTime() > ttlSeconds * 1000) {
      await unlink(path).catch(() => undefined)
      return null
    }
    try {
      return await readFile(path)
    } catch {
      return null
    }
  }

  return {
    async getVtt(key: string) {
      if (!validKey(key)) return null
      const found = await locate(key)
      if (!found) return null
      const bytes = await readFresh(join(found.directory, `${key}.vtt`), INDEX_TTL_SECONDS)
      if (!bytes) return null
      const text = bytes.toString('utf8')
      return text.startsWith('WEBVTT') ? text : null
    },
    async putVtt(key: string, vtt: string, opts: { content: string; ttlSeconds: number }) {
      if (!validKey(key)) return
      const directory = join(root, opts.content)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, `${key}.vtt`), vtt, 'utf8')
      try {
        await index.set(`subvtt:path:${key}`, JSON.stringify({ content: opts.content }), opts.ttlSeconds)
      } catch {
        // Index failure only costs a future re-discovery.
      }
    },
    async getOriginal(key: string) {
      if (!validKey(key)) return null
      const found = await locate(key)
      if (!found) return null
      let names: string[]
      try {
        names = await readdir(found.directory)
      } catch {
        return null
      }
      const name = names.find((entry) => entry.startsWith(`${key}.orig.`))
      if (!name) return null
      const ext = name.slice(`${key}.orig.`.length) as OriginalFile['ext']
      if (ext !== 'srt' && ext !== 'vtt' && ext !== 'ass' && ext !== 'ssa') return null
      const bytes = await readFresh(join(found.directory, name), INDEX_TTL_SECONDS)
      return bytes ? { bytes, ext } : null
    },
    async putOriginal(key: string, file: OriginalFile, opts: { content: string; ttlSeconds: number }) {
      if (!validKey(key)) return
      const directory = join(root, opts.content)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, `${key}.orig.${file.ext}`), file.bytes)
      try {
        await index.set(`subvtt:path:${key}`, JSON.stringify({ content: opts.content }), opts.ttlSeconds)
      } catch {
        // Index failure only costs a future re-discovery.
      }
    },
  }
}
