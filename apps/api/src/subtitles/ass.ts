/**
 * ASS/SSA → WebVTT converter. Handles the full SSA v4 / ASS v4+ formats
 * used by anime subtitle providers (Jimaku, NxshaSubs). Strips styling,
 * karaoke, positioning, and drawing tags — browsers render VTT through
 * `<track>` and cannot interpret ASS overrides.
 *
 * Conversion is lossy by design: the goal is readable, timed text, not
 * pixel-perfect reproduction of ASS styling.
 */

/** Convert ASS centisecond timestamp (`H:MM:SS.cc`) to VTT milliseconds. */
function assTimeToMs(time: string): number | null {
  const m = time.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/)
  if (!m) return null
  const [, h, min, s, cs] = m
  return Number(h) * 3_600_000 + Number(min) * 60_000 + Number(s) * 1_000 + Number(cs) * 10
}

function msToVtt(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const min = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  const mill = ms % 1_000
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(mill).padStart(3, '0')}`
}

/**
 * Strip ASS formatting tags from dialogue text. Removes override blocks
 * (`{...}`), inline commands (`\N`, `\n`, `\h`), and common styling tags
 * (`\b`, `\i`, `\u`, `\fn`, `\fs`, `\c`, `\1c`, `\2c`, `\3c`, `\4c`,
 * `\alpha`, `\1a`, `\2a`, `\3a`, `\4a`, `\bord`, `\shad`, `\pos`,
 * `\move`, `\org`, `\frz`, `\fscx`, `\fscy`, `\clip`, `\drawing`).
 */
function stripAssTags(text: string): string {
  return text
    // Strip override blocks {...}
    .replace(/\{[^}]*\}/g, '')
    // ASS line breaks
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    // Non-breaking space
    .replace(/\\h/g, ' ')
    // Drop any remaining backslash commands (karaoke, animations, etc.)
    .replace(/\\[kKfFoOpPtT][^\s\\]*/g, '')
    // Clean up excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}


export function assToVtt(ass: string): string | null {
  const text = ass.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')

  let inEvents = false
  let formatFields: string[] = []
  const dialogues: { start: string; end: string; text: string; style: string }[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Section headers
    if (/^\[events\]$/i.test(trimmed)) {
      inEvents = true
      continue
    }
    if (/^\[.*\]$/.test(trimmed)) {
      inEvents = false
      continue
    }

    if (!inEvents) continue

    // Format line: defines field order for Dialogue lines
    if (/^format:\s*/i.test(trimmed)) {
      formatFields = trimmed.slice(7).split(',').map((f) => f.trim().toLowerCase())
      continue
    }

    // Dialogue line
    if (!/^dialogue:\s*/i.test(trimmed)) continue
    const body = trimmed.slice(9) // len("Dialogue:") = 9
    // Split on comma, but the Text field (last) can contain commas
    const parts = body.split(',')
    if (parts.length < formatFields.length) continue

    // Text is everything after the fixed fields
    const textIdx = formatFields.indexOf('text')
    if (textIdx === -1) continue

    const startIdx = formatFields.indexOf('start')
    const endIdx = formatFields.indexOf('end')
    const styleIdx = formatFields.indexOf('style')
    if (startIdx === -1 || endIdx === -1) continue

    const startTime = parts[startIdx]?.trim() ?? ''
    const endTime = parts[endIdx]?.trim() ?? ''
    const style = styleIdx !== -1 ? (parts[styleIdx]?.trim() ?? '') : ''
    // Text field may contain commas — rejoin everything after textIdx
    const rawText = parts.slice(textIdx).join(',').trim()

    const startMs = assTimeToMs(startTime)
    const endMs = assTimeToMs(endTime)
    if (startMs === null || endMs === null) continue
    if (startMs >= endMs) continue

    dialogues.push({
      start: msToVtt(startMs),
      end: msToVtt(endMs),
      text: rawText,
      style,
    })
  }

  if (!dialogues.length) return null

  const out: string[] = ['WEBVTT', '']
  for (const d of dialogues) {
    const cleaned = stripAssTags(d.text)
    if (!cleaned) continue
    out.push(`${d.start} --> ${d.end}`)
    out.push(cleaned, '')
  }

  return out.length > 2 ? out.join('\n') : null
}
