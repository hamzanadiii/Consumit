import { describe, expect, it, vi } from 'vitest'
import { castContentType, createCastSender, type CastSdk, type CastSession } from './cast-sender'

function fakeSdk() {
  const contextListeners = new Map<string, (event: { sessionState?: string; castState?: string }) => void>()
  const controllerListeners = new Map<string, () => void>()
  const castState = { value: 'NO_DEVICES_AVAILABLE' }
  let currentSession: CastSession | null = null
  const playerState = { currentTime: 0, duration: 100, isPaused: true, volumeLevel: 0.9, isMuted: false, isConnected: true }
  const controller = {
    playOrPause: vi.fn(() => { playerState.isPaused = !playerState.isPaused }),
    seek: vi.fn(),
    setVolumeLevel: vi.fn(),
    muteOrUnmute: vi.fn(() => { playerState.isMuted = !playerState.isMuted }),
    addEventListener: vi.fn((type: string, listener: () => void) => { controllerListeners.set(type, listener) }),
  }
  const session: CastSession = {
    getCastDevice: () => ({ friendlyName: 'Living Room TV' }),
    endSession: vi.fn(),
    loadMedia: vi.fn(async () => undefined),
  }
  const sdk = {
    framework: {
      CastContext: {
        getInstance: () => ({
          setOptions: vi.fn(),
          getCastState: () => castState.value,
          getCurrentSession: () => currentSession,
          requestSession: vi.fn(async () => { currentSession = session }),
          addEventListener: vi.fn((type: string, listener: (event: { sessionState?: string; castState?: string }) => void) => {
            contextListeners.set(type, listener)
          }),
        }),
      },
      RemotePlayer: vi.fn(function (this: unknown) { return playerState }),
      RemotePlayerController: vi.fn(function (this: unknown) { return controller }),
      CastContextEventType: { SESSION_STATE_CHANGED: 'session', CAST_STATE_CHANGED: 'cast' },
      SessionState: { SESSION_STARTED: 'started', SESSION_RESUMED: 'resumed', SESSION_ENDED: 'ended' },
      RemotePlayerEventType: { ANY_CHANGE: 'any', IS_CONNECTED_CHANGED: 'connected' },
    },
  } satisfies CastSdk
  return { sdk: sdk as unknown as CastSdk, castState, contextListeners, controllerListeners, controller, playerState, session,
    setSession: (next: CastSession | null) => { currentSession = next } }
}

const load = { contentId: 'https://media.example/clip.m3u8', contentType: 'application/x-mpegurl', title: 'Dune', position: 42, customData: { sessionId: 's1' } }

describe('cast sender', () => {
  it('maps delivery types to receiver content types', () => {
    expect(castContentType('hls')).toBe('application/x-mpegurl')
    expect(castContentType('dash')).toBe('application/dash+xml')
    expect(castContentType('native')).toBe('video/mp4')
  })

  it('stays unavailable without a receiver id or SDK', async () => {
    expect(await createCastSender({ receiverId: '' }).ensure()).toBe(false)
    expect(await createCastSender({ receiverId: 'app-id', loadScript: async () => null }).ensure()).toBe(false)
    expect(createCastSender({ receiverId: '' }).available).toBe(false)
    expect(createCastSender({ receiverId: '' }).status).toBeNull()
  })

  it('reads a TV already discovered before the event subscription', async () => {
    const fake = fakeSdk()
    fake.castState.value = 'NOT_CONNECTED'
    const sender = createCastSender({ receiverId: 'app-id', sdk: fake.sdk })
    await expect(sender.requestSession()).rejects.toThrow('Cast is unavailable')
    expect(await sender.ensure()).toBe(true)
    expect(sender.available).toBe(true)
    fake.castState.value = 'NO_DEVICES_AVAILABLE'
    await sender.ensure()
    expect(sender.available).toBe(false)
    fake.contextListeners.get('cast')?.({ castState: 'UNEXPECTED' })
    expect(sender.available).toBe(false)
  })

  it('shares concurrent SDK checks and allows retry after failure', async () => {
    const fake = fakeSdk()
    const loadScript = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(fake.sdk)
    const sender = createCastSender({ receiverId: 'app-id', loadScript })
    expect(await Promise.all([sender.ensure(), sender.ensure()])).toEqual([false, false])
    expect(loadScript).toHaveBeenCalledOnce()
    expect(await sender.ensure()).toBe(true)
    expect(loadScript).toHaveBeenCalledTimes(2)
  })

  it('tracks session start and end with the device name', async () => {
    const fake = fakeSdk()
    const sender = createCastSender({ receiverId: 'app-id', sdk: fake.sdk })
    expect(await sender.ensure()).toBe(true)
    expect(sender.status).toBeNull()
    fake.setSession(fake.session)
    fake.contextListeners.get('session')?.({ sessionState: 'started' })
    expect(sender.status).toMatchObject({ connected: true, deviceName: 'Living Room TV' })
    fake.contextListeners.get('session')?.({ sessionState: 'ended' })
    expect(sender.status).toBeNull()
  })

  it('marks availability from cast state changes', async () => {
    const fake = fakeSdk()
    const sender = createCastSender({ receiverId: 'app-id', sdk: fake.sdk })
    await sender.ensure()
    const states: boolean[] = []
    sender.subscribe(() => states.push(sender.available))
    fake.contextListeners.get('cast')?.({ castState: 'NOT_CONNECTED' })
    fake.contextListeners.get('cast')?.({ castState: 'NO_DEVICES_AVAILABLE' })
    expect(sender.available).toBe(false)
    expect(states).toEqual([true, false])
  })

  it('loads media with session context and refreshes status', async () => {
    const fake = fakeSdk()
    const sender = createCastSender({ receiverId: 'app-id', sdk: fake.sdk })
    await sender.ensure()
    await expect(sender.loadMedia(load)).rejects.toThrow('Connect to a Cast device first.')
    fake.setSession(fake.session)
    fake.contextListeners.get('session')?.({ sessionState: 'started' })
    await sender.loadMedia({ ...load, playing: false })
    expect(fake.session.loadMedia).toHaveBeenCalledWith(expect.objectContaining({ currentTime: 42, autoplay: false }))
    expect(fake.session.loadMedia).toHaveBeenCalledOnce()
    const info = (fake.session.loadMedia as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].media
    expect(info).toMatchObject({ contentId: load.contentId, contentType: load.contentType, streamType: 'BUFFERED' })
    expect(info.customData).toMatchObject({ sessionId: 's1', position: 42 })
    expect(sender.status).toMatchObject({ connected: true, position: 42 })
  })

  it('drives remote transport controls and guards bad seeks', async () => {
    const fake = fakeSdk()
    const sender = createCastSender({ receiverId: 'app-id', sdk: fake.sdk })
    await sender.ensure()
    fake.setSession(fake.session)
    fake.contextListeners.get('session')?.({ sessionState: 'started' })
    await sender.loadMedia(load)
    sender.playOrPause()
    expect(fake.controller.playOrPause).toHaveBeenCalledOnce()
    sender.seekTo(10)
    expect(fake.controller.seek).toHaveBeenCalledOnce()
    sender.seekTo(-5)
    sender.seekTo(Number.NaN)
    expect(fake.controller.seek).toHaveBeenCalledOnce()
    sender.setVolume(2)
    expect(fake.playerState.volumeLevel).toBe(1)
    expect(fake.controller.setVolumeLevel).toHaveBeenCalledWith()
    sender.setVolume(-1)
    expect(fake.playerState.volumeLevel).toBe(0)
    expect(fake.controller.setVolumeLevel).toHaveBeenCalledTimes(2)
    sender.setMuted(true)
    expect(fake.controller.muteOrUnmute).toHaveBeenCalledOnce()
    sender.setMuted(true)
    expect(fake.controller.muteOrUnmute).toHaveBeenCalledOnce()
    sender.endSession()
    expect(fake.session.endSession).toHaveBeenCalledWith(true)
    expect(sender.status).toBeNull()
  })

  it('opens the device picker through the cast session', async () => {
    const offline = createCastSender({ receiverId: 'app-id', loadScript: async () => null })
    expect(await offline.ensure()).toBe(false)
    await expect(offline.requestSession()).rejects.toThrow('Cast is unavailable on this device.')
    const fake = fakeSdk()
    const sender = createCastSender({ receiverId: 'app-id', sdk: fake.sdk })
    await sender.ensure()
    await sender.requestSession()
    fake.contextListeners.get('session')?.({ sessionState: 'started' })
    expect(sender.status?.connected).toBe(true)
  })
})
