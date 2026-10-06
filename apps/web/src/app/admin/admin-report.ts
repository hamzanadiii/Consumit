import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderInspection } from '@/lib/admin-browser'

export function inspectionReport(ref: PlaybackRef | null, rows: { id: string; status: string; result?: ProviderInspection; browser?: { decoded: boolean; startupMs?: number; stalls: number; seeked: boolean; failure?: string } }[]) {
  // Explicit projection: preview URLs, raw errors, source keys and tokens never export.
  return { version: 1, capturedAt: new Date().toISOString(), ref, results: rows.map(row => ({
    provider: row.id, status: row.status, browser: row.browser,
    ...(row.result ? { code: row.result.code, resolveMs: row.result.elapsedMs, region: row.result.region, delivery: row.result.delivery ?? 'direct',
      rejectedSources: row.result.rejectedSources, sources: row.result.sources.map(source => ({
        type: source.type, host: source.host, language: source.language, quality: source.qualityHint, subtitles: source.subtitleCount,
      })) } : {}),
  })) }
}

export function downloadAdminReport(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
