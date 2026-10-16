/** Sync correction: shift every VTT cue timestamp by a member-chosen offset.
 *  The source file is never modified — shifted variants are served from the
 *  file route (`?offsetMs=`) and cached under key+offset, so one viewer's
 *  correction never affects anyone else's. */

export const MAX_OFFSET_MS = 120_000

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function shiftTimestamp(hour: string | undefined, minute: string, second: string, ms: string, offsetMs: number): string | null {
  const total = (hour ? Number(hour) * 3600000 : 0) + Number(minute) * 60000 + Number(second) * 1000 + Number(ms) + offsetMs
  if (!Number.isFinite(total) || total < 0) return null
  const hours = Math.floor(total / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  // Preserve the incoming shape: two-part stays two-part when it fits.
  if (!hour && hours === 0) return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`
}

/** Shift all cue timings in VTT text. Cue settings/positioning after the
 *  timestamps are preserved; advanced cues clamp to zero, fully-negative
 *  ones disappear. Returns null when nothing survives. */
export function shiftVtt(vtt: string, offsetMs: number): string | null {
  if (!Number.isInteger(offsetMs) || offsetMs === 0 || Math.abs(offsetMs) > MAX_OFFSET_MS) return null
  const lines = vtt.split('\n')
  const out: string[] = []
  let keptCues = 0
  for (const line of lines) {
    const match = line.match(/(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})(.*)$/)
    if (!match) {
      out.push(line)
      continue
    }
    const [, sh, sm, ss, sms, eh, em, es, ems, rest] = match as [string, string | undefined, string, string, string, string | undefined, string, string, string, string]
    let start = shiftTimestamp(sh, sm, ss, sms, offsetMs)
    const end = shiftTimestamp(eh, em, es, ems, offsetMs)
    if (!end) continue
    // Clamp advanced cues to zero instead of dropping them outright; cues
    // fully before zero (no positive end) still disappear.
    if (!start) start = sh ? '00:00:00.000' : '00:00.000'
    keptCues += 1
    out.push(`${start} --> ${end}${rest}`)
  }
  if (!keptCues) return null
  const text = out.join('\n')
  return text.startsWith('WEBVTT') && text.includes('-->') ? text : null
}
