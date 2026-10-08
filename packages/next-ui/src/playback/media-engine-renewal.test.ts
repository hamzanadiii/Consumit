import type { HlsConfig, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from 'hls.js'
import { expect, it, vi } from 'vitest'
import { attachMediaEngine } from './media-engine'

const fixture = vi.hoisted(() => ({ configs: [] as Partial<HlsConfig>[], requests: [] as string[], documents: new Map<string, string>(), loads: vi.fn(), attaches: vi.fn(), destroys: vi.fn() }))
vi.mock('hls.js', () => {
  class Xhr {
    stats = {} as LoaderStats
    context: LoaderContext | null = null
    load(context: LoaderContext, _config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      this.context = context
      fixture.requests.push(context.url)
      const data = fixture.documents.get(context.url)
      if (data === undefined) callbacks.onError({ code: 403, text: 'Expired capability' }, context, null, this.stats)
      else callbacks.onSuccess({ url: context.url, data }, this.stats, context, null)
    }
    abort() {}
    destroy() {}
  }
  return { default: class {
    static DefaultConfig = { loader: Xhr }
    static isSupported = () => true
    static Events = { MANIFEST_PARSED: 'manifest', AUDIO_TRACKS_UPDATED: 'audio', SUBTITLE_TRACKS_UPDATED: 'subs', ERROR: 'error' }
    constructor(config: Partial<HlsConfig>) { fixture.configs.push(config) }
    on() {}
    loadSource = fixture.loads
    attachMedia = fixture.attaches
    destroy = fixture.destroys
  } }
})

it('requests fresh segment capabilities across two renewals without reloading the HLS engine', async () => {
  fixture.configs.length = 0; fixture.requests.length = 0; fixture.documents.clear()
  fixture.loads.mockClear(); fixture.attaches.mockClear(); fixture.destroys.mockClear()
  const root = 'https://relay.example/old-root'
  const oldSegment = 'https://relay.example/old-segment'
  const playlist = (url: string) => `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\n${url}\n#EXT-X-ENDLIST\n`
  fixture.documents.set(root, playlist(oldSegment))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(fixture.documents.get(url), { status: fixture.documents.has(url) ? 200 : 403 })))
  let current = root
  const source = { type: 'hls' as const, src: root, relayLease: () => ({ src: current }) }
  const engine = await attachMediaEngine(document.createElement('video'), source, { tracks() {}, fatal() {} })
  const { default: Hls } = await import('hls.js')
  const Loader = fixture.configs[0]?.loader ?? Hls.DefaultConfig.loader
  const request = (url: string, responseType: string) => new Promise<string>((resolve, reject) => {
    const loader = new Loader({} as HlsConfig)
    loader.load({ url, responseType, type: 'manifest' } as LoaderContext, {} as LoaderConfiguration, {
      onSuccess: response => resolve(String(response.data)), onError: error => reject(new Error(error.text)), onTimeout: () => reject(new Error('timeout')),
    })
  })
  await request(root, 'text')
  // The old capability is expired, while background resolution has returned
  // a new manifest for the identical recording. No player source switch occurs.
  for (const generation of ['fresh', 'newest']) {
    current = `https://relay.example/${generation}-root`
    const segment = `https://relay.example/${generation}-segment`
    fixture.documents.set(current, playlist(segment)); fixture.documents.set(segment, 'media-bytes')
    expect(await request(oldSegment, 'arraybuffer')).toBe('media-bytes')
    expect(fixture.requests.at(-1)).toBe(segment)
  }
  expect(fixture.loads).toHaveBeenCalledTimes(1)
  expect(fixture.attaches).toHaveBeenCalledTimes(1)
  expect(fixture.destroys).not.toHaveBeenCalled()
  engine.destroy()
  vi.unstubAllGlobals()
})
