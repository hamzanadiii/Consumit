import { z } from 'zod'

export const releaseRefSchema = z.object({
  kind: z.enum(['series', 'anime']), id: z.int().positive(), season: z.int().min(0), episode: z.int().positive(),
}).strict().refine(ref => ref.kind === 'series' ? ref.season > 0 : ref.season === 0, 'Use a canonical episode identity.')
export const releaseEpisodeSchema = z.object({
  ref: releaseRefSchema, title: z.string().min(1).max(500), episodeTitle: z.string().max(500).nullable(),
  imageUrl: z.url().refine(url => url.startsWith('https://')).nullable(),
  releasedAt: z.iso.datetime(), datePrecision: z.enum(['date', 'instant']),
  checkedAt: z.iso.datetime().nullable(),
})
export const releaseShelfSchema = z.object({ items: z.array(releaseEpisodeSchema).max(12), trackedCount: z.int().nonnegative(), partial: z.boolean() })
export const notificationPreferencesSchema = z.object({ newEpisodes: z.boolean() }).strict()
export const releaseNotificationSchema = z.object({
  id: z.uuid(), episode: releaseEpisodeSchema, createdAt: z.iso.datetime(), readAt: z.iso.datetime().nullable(),
})
export const notificationPageSchema = z.object({ items: z.array(releaseNotificationSchema).max(50), unreadCount: z.int().nonnegative(), nextCursor: z.uuid().nullable() })
export const notificationQuerySchema = z.object({
  filter: z.enum(['all', 'unread']).default('all'), cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
})
export const readNotificationSchema = z.object({ read: z.literal(true) }).strict()
export const releaseProbeSourceSchema = z.object({
  mediaHosts: z.array(z.string().min(1).max(253)).max(128), mediaHostPatterns: z.array(z.string().min(1).max(1000)).max(20),
  src: z.string().min(1).max(4096), type: z.enum(['native', 'hls', 'dash']), expiresAt: z.iso.datetime(),
  providerId: z.string().min(1).max(80), revision: z.string().length(64), region: z.string().length(2), audioLanguage: z.string().min(2).max(30),
})
export const releaseProbeJobSchema = z.object({ id: z.uuid(), leaseToken: z.uuid(), expiresAt: z.iso.datetime(), ref: releaseRefSchema })
export const releaseProbeEvidenceSchema = z.object({
  decodedFrames: z.int().min(0).max(1_000_000), advancedSeconds: z.number().finite().min(0).max(90),
  seeked: z.boolean(), resumedSeconds: z.number().finite().min(0).max(90),
  failure: z.enum(['resolve', 'media', 'timeout', 'frozen', 'seek']).optional(),
}).strict()
export type ReleaseRef = z.infer<typeof releaseRefSchema>
export type ReleaseEpisode = z.infer<typeof releaseEpisodeSchema>
export type ReleaseShelf = z.infer<typeof releaseShelfSchema>
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>
export type ReleaseNotification = z.infer<typeof releaseNotificationSchema>
export type NotificationPage = z.infer<typeof notificationPageSchema>
export type NotificationQuery = z.infer<typeof notificationQuerySchema>
export type ReleaseProbeSource = z.infer<typeof releaseProbeSourceSchema>
export type ReleaseProbeJob = z.infer<typeof releaseProbeJobSchema>
export type ReleaseProbeEvidence = z.infer<typeof releaseProbeEvidenceSchema>
