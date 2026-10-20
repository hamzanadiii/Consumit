import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const receiverScript = await readFile(resolve(process.cwd(), 'public/cast/receiver.js'), 'utf8')

type RequestInfo = { headers?: Record<string, string> }
type LoadData = { customData?: { position?: number; headers?: Record<string, unknown> }; currentTime?: number }
type RequestHandler = (request: RequestInfo) => void

function loadReceiver() {
  let playbackConfig: { manifestRequestHandler?: RequestHandler; segmentRequestHandler?: RequestHandler } | undefined
  let loadRequest: ((request: LoadData) => LoadData) | undefined
  const brand = { hidden: false }
  const playerManager = {
    setMessageInterceptor: vi.fn((_type: string, handler: (request: LoadData) => LoadData) => { loadRequest = handler }),
    addEventListener: vi.fn(),
  }
  const context = {
    getPlayerManager: () => playerManager,
    addEventListener: vi.fn(),
    start: vi.fn((options?: { playbackConfig?: typeof playbackConfig }) => { playbackConfig = options?.playbackConfig }),
  }
  class PlaybackConfig {
    manifestRequestHandler?: RequestHandler
    segmentRequestHandler?: RequestHandler
  }
  const cast = {
    framework: {
      CastReceiverContext: { getInstance: () => context },
      PlaybackConfig,
      messages: { MessageType: { LOAD: 'LOAD' } },
      events: { category: { CORE: 'CORE' }, EventType: { MEDIA_STATUS: 'MEDIA_STATUS' } },
      system: { EventType: { SHUTDOWN: 'SHUTDOWN' } },
    },
  }
  const document = { getElementById: () => brand }
  new Function('cast', 'document', receiverScript)(cast, document)
  return { brand, context, playerManager, getPlaybackConfig: () => playbackConfig, getLoadRequest: () => loadRequest }
}

describe('custom Cast receiver', () => {
  it('installs CAF manifest and segment handlers and applies validated LOAD headers', () => {
    const receiver = loadReceiver()
    const playbackConfig = receiver.getPlaybackConfig()
    expect(playbackConfig?.manifestRequestHandler).toEqual(expect.any(Function))
    expect(playbackConfig?.segmentRequestHandler).toEqual(expect.any(Function))

    const loaded = receiver.getLoadRequest()?.({
      currentTime: 0,
      customData: {
        position: 42,
        headers: { referer: 'https://provider.example/watch', origin: 'https://provider.example' },
      },
    })
    expect(loaded?.currentTime).toBe(42)

    const manifestRequest: RequestInfo = { headers: {} }
    playbackConfig?.manifestRequestHandler?.(manifestRequest)
    expect(manifestRequest.headers).toEqual({
      Referer: 'https://provider.example/watch',
      Origin: 'https://provider.example',
    })

    const nextLoaded = receiver.getLoadRequest()?.({ customData: { headers: { referer: 'http://unsafe.example' } } })
    expect(nextLoaded?.currentTime).toBeUndefined()
    const segmentRequest: RequestInfo = { headers: {} }
    playbackConfig?.segmentRequestHandler?.(segmentRequest)
    expect(segmentRequest.headers).toEqual({})
  })
})
