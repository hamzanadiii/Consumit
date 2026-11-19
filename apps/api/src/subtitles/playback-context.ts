import { z } from 'zod'
import { playbackRefSchema, playbackTrackSchema } from '@consumit/contracts'

/** Private, server-created context. Browsers supply only an owned session ID. */
export const subtitlePlaybackContextSchema = z.object({
  ref: playbackRefSchema, videoVersion: z.string().regex(/^vv-[a-f0-9]{64}$/), providerId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  hosts: z.array(z.string().regex(/^(?:\*\.)?[a-z0-9.-]+\.[a-z]{2,}$/)).max(100),
  expiresAt: z.iso.datetime(), captions: z.array(playbackTrackSchema).max(32),
  headers: z.record(z.string(), z.string().max(512)).default({}),
  release: z.string().max(160).optional(), runtimeSec: z.number().positive().max(86400).optional(),
}).strict()
export type SubtitlePlaybackContext = z.infer<typeof subtitlePlaybackContextSchema>
