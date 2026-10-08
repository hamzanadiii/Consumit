import { describe, expect, it, vi } from 'vitest'
import { readLeasePlaylist, RelayLeaseRouter } from './relay-lease'

const base = 'https://relay.example/'
const master = (prefix: string) => `#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="main",NAME="English",LANGUAGE="en",URI="${prefix}audio"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080,AUDIO="main"\n${prefix}video\n`
const media = (prefix: string) => `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:42\n#EXT-X-KEY:METHOD=AES-128,URI="${prefix}key",IV=0x01\n#EXT-X-MAP:URI="${prefix}map",BYTERANGE="16@0"\n#EXTINF:6,\n#EXT-X-BYTERANGE:100@16\n${prefix}segment\n#EXT-X-DISCONTINUITY\n#EXTINF:6,\n${prefix}tail\n#EXT-X-ENDLIST\n`

describe('buffer-preserving relay leases', () => {
  it('maps video, audio, keys and maps through matching nested timelines and shares control reads', async () => {
    let root = base + 'old-root'
    const documents = new Map([[base + 'fresh-root', master('fresh-')], [base + 'fresh-video', media('fresh-')], [base + 'fresh-audio', media('fresh-audio-')]])
    const read = vi.fn(async (url: string) => documents.get(url)!)
    const readKey = vi.fn(async () => new Uint8Array(16).fill(7))
    const router = new RelayLeaseRouter(root, () => ({ src: root }), read, readKey)
    router.observe(root, master('old-'))
    const baselineVideo = router.observe(base + 'old-video', media('old-'))
    router.observe(base + 'old-audio', media('old-audio-'))
    router.observeAsset(base + 'old-key', new Uint8Array(16).fill(7).buffer)
    router.observeAsset(base + 'old-audio-key', new Uint8Array(16).fill(7).buffer)
    root = base + 'fresh-root'
    const urls = ['old-key', 'old-map', 'old-segment', 'old-tail', 'old-audio-segment']
    expect(await Promise.all(urls.map(url => router.resolve(base + url)))).toEqual(urls.map(url => base + url.replace('old-', 'fresh-')))
    expect(read).toHaveBeenCalledTimes(3)
    expect(router.observe(base + 'old-video', media('fresh-'), base + 'fresh-video')).toBe(baselineVideo)
    expect(await router.resolve(base + 'old-video')).toBe(base + 'fresh-video')
    router.destroy()
  })
  it.each([
    ['duration', '#EXTINF:6,', '#EXTINF:5,'],
    ['sequence', 'SEQUENCE:42', 'SEQUENCE:43'],
    ['key IV', 'IV=0x01', 'IV=0x02'],
    ['range', '100@16', '100@17'],
    ['discontinuity', '#EXT-X-DISCONTINUITY', '#EXT-X-DISCONTINUITY-SEQUENCE:1'],
  ])('rejects changed %s before requesting fresh media bytes', async (_name, from, to) => {
    const router = new RelayLeaseRouter(base + 'old-root', () => ({ src: base + 'fresh-root' }), async () => media('fresh-').replace(from, to))
    router.observe(base + 'old-root', media('old-'))
    await expect(router.resolve(base + 'old-segment')).rejects.toThrow('recording changed')
    router.destroy()
  })
  it('rejects changed rendition metadata before selecting a playlist', async () => {
    const router = new RelayLeaseRouter(base + 'old-root', () => ({ src: base + 'fresh-root' }), async () => master('fresh-').replace('1920x1080', '1280x720'))
    router.observe(base + 'old-root', master('old-'))
    await expect(router.resolve(base + 'old-video')).rejects.toThrow('recording changed')
  })
  it('retains ordinary recovery for live playlists instead of blocking initial playback', async () => {
    const read = vi.fn()
    const router = new RelayLeaseRouter(base + 'old-root', () => ({ src: base + 'fresh-root' }), read)
    const live = media('old-').replace('#EXT-X-ENDLIST', '')
    expect(router.observe(base + 'old-root', live)).toBe(live)
    expect(await router.resolve(base + 'old-segment')).toBe(base + 'old-segment')
    expect(read).not.toHaveBeenCalled()
  })
  it('retries a failed control read without retaining a failed generation', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(media('fresh-'))
    const router = new RelayLeaseRouter(base + 'old-root', () => ({ src: base + 'fresh-root' }), read, async () => new Uint8Array(16))
    router.observe(base + 'old-root', media('old-'))
    router.observeAsset(base + 'old-key', new Uint8Array(16).buffer)
    await expect(router.resolve(base + 'old-segment')).rejects.toThrow('offline')
    expect(await router.resolve(base + 'old-segment')).toBe(base + 'fresh-segment')
  })
  it('rejects rotated key bytes before returning a new segment to the existing decryptor', async () => {
    const router = new RelayLeaseRouter(base + 'old-root', () => ({ src: base + 'fresh-root' }), async () => media('fresh-'), async () => new Uint8Array(16).fill(2))
    router.observe(base + 'old-root', media('old-'))
    router.observeAsset(base + 'old-key', new Uint8Array(16).fill(1).buffer)
    await expect(router.resolve(base + 'old-segment')).rejects.toThrow('key changed')
  })
  it('omits credentials for fresh control requests and cancels outstanding reads on teardown', async () => {
    let received: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      received = init
      return new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))
    }))
    try {
      const router = new RelayLeaseRouter(base + 'old-root', () => ({ src: base + 'fresh-root' }))
      router.observe(base + 'old-root', media('old-'))
      const pending = router.resolve(base + 'old-segment')
      expect(received?.credentials).toBe('omit')
      router.destroy()
      await expect(pending).rejects.toThrow('aborted')
    } finally { vi.unstubAllGlobals() }
  })
  it('bounds hostile input and refuses private destinations and unsupported playlist variables', () => {
    expect(() => readLeasePlaylist(media('http://127.0.0.1/'), base)).toThrow('reference')
    expect(() => readLeasePlaylist('#EXTM3U\n#EXT-X-DEFINE:NAME="x",VALUE="y"\n', base)).toThrow('Unsupported')
    expect(() => readLeasePlaylist('#EXTM3U\n' + 'a'.repeat(2 * 1024 * 1024), base)).toThrow('Invalid')
  })
})
