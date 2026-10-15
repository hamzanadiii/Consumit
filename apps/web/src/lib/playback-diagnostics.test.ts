import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatPlaybackDiagnostics, readPlaybackDiagnostics, storePlaybackDiagnostics } from './playback-diagnostics'

const diagnostic = { ref: { kind: 'anime' as const, id: 16498, episode: 1 }, provider: 'fixture-north', browser: 'Firefox' as const, delivery: 'direct' as const, category: 'network' as const }
afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })

describe('optional playback diagnostics', () => {
  it('retains only canonical diagnostic fields for the current session', () => {
    storePlaybackDiagnostics(diagnostic)
    expect(readPlaybackDiagnostics()).toEqual(diagnostic)
    expect(formatPlaybackDiagnostics(diagnostic)).toContain('Title: anime 16498 · S1 E1')
    expect(formatPlaybackDiagnostics(diagnostic)).not.toMatch(/https?:|cookie|credential/i)
  })
  it('rejects unexpected source URLs, cookies and credentials', () => {
    for (const extra of [{ playbackUrl: 'https://private.example/media?token=secret' }, { cookie: 'secret' }, { credentials: 'secret' }]) {
      storePlaybackDiagnostics({ ...diagnostic, ...extra })
      expect(readPlaybackDiagnostics()).toBeNull()
      expect(sessionStorage.length).toBe(0)
    }
  })
  it('ignores expired and malformed diagnostic storage', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    storePlaybackDiagnostics(diagnostic)
    vi.mocked(Date.now).mockReturnValue(3_602_000)
    expect(readPlaybackDiagnostics()).toBeNull()
    sessionStorage.setItem('consumit.report.playback', '{')
    expect(readPlaybackDiagnostics()).toBeNull()
  })
})
