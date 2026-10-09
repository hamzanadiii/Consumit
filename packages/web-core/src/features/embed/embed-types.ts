import { z } from 'zod'
import { isSafeMediaUrl } from '@consumit/playback-core/media-source'

const mediaUrl = z.string().max(4096).refine(isSafeMediaUrl)
const hint = z.string().max(4096).refine(value => !/[\r\n]/.test(value) && isSafeMediaUrl(value))
const source = z.object({
  url: mediaUrl,
  type: z.enum(['hls', 'dash', 'native']).default('hls'),
  quality: z.string().max(80).default('Auto'),
  provider: z.string().min(1).max(160),
  headers: z.record(z.string(), hint).refine(headers => Object.keys(headers).every(name => name === 'referer' || name === 'origin')).default({}),
})
const subtitle = z.object({ url: mediaUrl, label: z.string().min(1).max(160), format: z.enum(['vtt', 'srt']) })

/** Retained legacy response boundary; no public embed API is enabled. */
export const legacyEmbedStreamsSchema = z.object({
  success: z.boolean(), sources: z.array(source).max(128).default([]), subtitles: z.array(subtitle).max(128).default([]),
})
export type EmbedSource = z.infer<typeof source>
export type EmbedSub = z.infer<typeof subtitle>
