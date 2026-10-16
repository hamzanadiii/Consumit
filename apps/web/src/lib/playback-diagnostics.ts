import { playbackDiagnosticsSchema, type PlaybackDiagnostics } from '@consumit/contracts'
const key = 'consumit.report.playback'
export function browserName(): PlaybackDiagnostics['browser'] {
  const agent = navigator.userAgent
  return /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Other'
}
export function storePlaybackDiagnostics(value: PlaybackDiagnostics) {
  const parsed = playbackDiagnosticsSchema.safeParse(value)
  if (!parsed.success) return
  try { sessionStorage.setItem(key, JSON.stringify({ value: parsed.data, at: Date.now() })) } catch { /* Reporting stays optional. */ }
}
export function readPlaybackDiagnostics(): PlaybackDiagnostics | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (!stored || typeof stored.at !== 'number' || Date.now() - stored.at > 3600_000) return null
    const parsed = playbackDiagnosticsSchema.safeParse(stored.value)
    return parsed.success ? parsed.data : null
  } catch { return null }
}
export function formatPlaybackDiagnostics(value: PlaybackDiagnostics) {
  const { ref } = value
  return `Playback diagnostics:\nTitle: ${ref.kind} ${ref.id}${ref.episode ? ` · S${ref.season ?? 1} E${ref.episode}` : ''}\nProvider: ${value.provider ?? 'Unavailable'}\nBrowser: ${value.browser}\nDelivery: ${value.delivery ?? 'Unavailable'}\nFailure: ${value.category}`
}
