import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { collectCanaryTargets } from './delivery-canary.ts'
import type { MediaTransport } from './transport.ts'

const hosts = ['cdn.example']
const signal = new AbortController().signal
const doc = (text: string, contentType = 'application/vnd.apple.mpegurl') => ({ status: 200, headers: new Headers({ 'content-type': contentType }), body: Readable.from([text]) })
const transportFor = (routes: Record<string, ReturnType<typeof doc> | null>): MediaTransport =>
  (async (url) => {
    const found = routes[url]
    if (!found) return { url, status: 404, headers: new Headers(), body: Readable.from([]) }
    return { url, ...found }
  })
const kinds = (targets: { kind: string; url: string }[]) => targets.map((t) => `${t.kind}:${t.url.split('/').at(-1)}`).sort()

describe('canary collector', () => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000\nhigh.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3000\nextra.m3u8'
  const rendition = (name: string) =>
    `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:6,\n${name}-0.ts\n#EXTINF:6,\n${name}-1.ts\n#EXTINF:6,\n${name}-2.ts`
  const routes = {
    'https://cdn.example/master.m3u8': doc(master),
    'https://cdn.example/low.m3u8': doc(rendition('low')),
    'https://cdn.example/high.m3u8': doc(rendition('high')),
    'https://cdn.example/extra.m3u8': doc(rendition('extra')),
  }
  it('follows bounded variants and segments, both engines each', async () => {
    const { targets, note } = await collectCanaryTargets({
      url: 'https://cdn.example/master.m3u8', type: 'hls', hosts,
      transport: transportFor(routes), signal, maxVariants: 2, maxSegments: 2,
    })
    expect(note).toBeUndefined()
    expect(kinds(targets)).toEqual([
      'key:key.bin', 'key:key.bin',
      'manifest:high.m3u8', 'manifest:high.m3u8',
      'manifest:low.m3u8', 'manifest:low.m3u8',
      'manifest:master.m3u8', 'manifest:master.m3u8',
      'segment:high-0.ts', 'segment:high-0.ts',
      'segment:high-1.ts', 'segment:high-1.ts',
      'segment:low-0.ts', 'segment:low-0.ts',
      'segment:low-1.ts', 'segment:low-1.ts',
    ])
    expect(targets.filter((t) => t.url.endsWith('extra.m3u8'))).toEqual([])
    expect(targets.filter((t) => t.url.endsWith('-2.ts'))).toEqual([])
    expect(new Set(targets.map((t) => t.engine))).toEqual(new Set(['hlsjs', 'native']))
    expect(new Set(targets.map((t) => t.host))).toEqual(new Set(['cdn.example']))
  })
  it('collects media playlists served directly as the source', async () => {
    const { targets } = await collectCanaryTargets({
      url: 'https://cdn.example/live.m3u8', type: 'hls', hosts,
      transport: transportFor({ 'https://cdn.example/live.m3u8': doc('#EXTM3U\n#EXTINF:6,\na.ts\n#EXTINF:6,\nb.ts') }),
      signal, maxSegments: 1,
    })
    expect(kinds(targets)).toEqual(['manifest:live.m3u8', 'manifest:live.m3u8', 'segment:a.ts', 'segment:a.ts'])
  })
  it('emits a single mp4 target for native sources', async () => {
    const { targets, note } = await collectCanaryTargets({
      url: 'https://cdn.example/movie.mp4', type: 'native', hosts,
      transport: transportFor({}), signal,
    })
    expect(note).toBeUndefined()
    expect(targets).toHaveLength(2)
    expect(targets.every((t) => t.kind === 'mp4' && t.host === 'cdn.example')).toBe(true)
  })
  it('reports notes instead of targets for unreachable or foreign sources', async () => {
    const unreachable = await collectCanaryTargets({
      url: 'https://cdn.example/gone.m3u8', type: 'hls', hosts, transport: transportFor({}), signal,
    })
    expect(unreachable.targets).toEqual([])
    expect(unreachable.note).toMatch('unreachable')
    const foreign = await collectCanaryTargets({
      url: 'https://evil.example/master.m3u8', type: 'hls', hosts, transport: transportFor({}), signal,
    })
    expect(foreign).toMatchObject({ targets: [], note: 'source outside media allowlist' })
    const notManifest = await collectCanaryTargets({
      url: 'https://cdn.example/master.m3u8', type: 'hls', hosts,
      transport: transportFor({ 'https://cdn.example/master.m3u8': doc('<html>nope</html>', 'text/html') }), signal,
    })
    expect(notManifest.targets).toEqual([])
    expect(notManifest.note).toMatch('strict parsing')
    const dash = await collectCanaryTargets({
      url: 'https://cdn.example/manifest.mpd', type: 'dash', hosts, transport: transportFor({}), signal,
    })
    expect(dash).toMatchObject({ targets: [], note: 'only hls and native sources are canaried' })
  })
  it('flags references outside the allowlist instead of skipping silently', async () => {
    const { targets, note } = await collectCanaryTargets({
      url: 'https://cdn.example/master.m3u8', type: 'hls', hosts,
      transport: transportFor({
        'https://cdn.example/master.m3u8': doc('#EXTM3U\n#EXTINF:6,\nhttps://rotated-cdn.example/s0.ts\n#EXTINF:6,\ns1.ts'),
      }),
      signal, maxSegments: 2,
    })
    expect(targets.map((t) => t.url).every((url) => url.includes('cdn.example') && !url.includes('rotated'))).toBe(true)
    expect(targets.some((t) => t.kind === 'segment' && t.url.endsWith('s1.ts'))).toBe(true)
    expect(note).toMatch('partial walk')
    expect(note).toMatch('rotated-cdn.example')
  })
  it('flags masters that parse but contain no references', async () => {
    const { targets, note } = await collectCanaryTargets({
      url: 'https://cdn.example/empty.m3u8', type: 'hls', hosts,
      transport: transportFor({ 'https://cdn.example/empty.m3u8': doc('#EXTM3U\n#EXT-X-VERSION:3\n') }), signal,
    })
    expect(targets).toHaveLength(2)
    expect(note).toMatch('no references')
  })
})
