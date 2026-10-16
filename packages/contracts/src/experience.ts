import { z } from 'zod'

export const GUIDE_VERSION = 1
export const serverOrderSchema = z.array(z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)).max(128).refine(ids => new Set(ids).size === ids.length, 'Choose each server once.')
export const serverOrdersSchema = z.object({ movie: serverOrderSchema.default([]), series: serverOrderSchema.default([]), anime: serverOrderSchema.default([]) }).strict()
export const experiencePreferencesSchema = z.object({
  serverOrders: serverOrdersSchema.default({ movie: [], series: [], anime: [] }),
  adsEnabled: z.boolean().default(true),
  audioLanguage: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).default('en'),
  animeAudio: z.enum(['sub', 'dub']).default('sub'),
  subtitlesEnabled: z.boolean().default(true),
  subtitleLanguages: z.array(z.string().regex(/^[a-z]{2,3}$/)).max(3).refine(v => new Set(v).size === v.length, 'Choose distinct languages.').default(['en']),
  qualityHeight: z.int().min(144).max(4320).nullable().default(null),
  autoplayNextEpisode: z.boolean().default(false),
  playbackConfigured: z.boolean().default(false),
  guideVersion: z.int().min(0).max(GUIDE_VERSION).default(0),
  guideStatus: z.enum(['pending', 'dismissed', 'completed']).default('pending'),
  communityDismissed: z.boolean().default(false),
}).strict()
// Defaults belong to complete reads only. Zod applies defaults inside optional fields,
// so partial() on the response shape would reset unrelated choices on every PATCH.
export const experiencePatchSchema = z.object({
  serverOrders: serverOrdersSchema.optional(),
  adsEnabled: z.boolean().optional(),
  audioLanguage: experiencePreferencesSchema.shape.audioLanguage.removeDefault().optional(),
  animeAudio: experiencePreferencesSchema.shape.animeAudio.removeDefault().optional(),
  subtitlesEnabled: experiencePreferencesSchema.shape.subtitlesEnabled.removeDefault().optional(),
  subtitleLanguages: experiencePreferencesSchema.shape.subtitleLanguages.removeDefault().optional(),
  qualityHeight: experiencePreferencesSchema.shape.qualityHeight.removeDefault().optional(),
  autoplayNextEpisode: experiencePreferencesSchema.shape.autoplayNextEpisode.removeDefault().optional(),
  guideVersion: experiencePreferencesSchema.shape.guideVersion.removeDefault().optional(),
  guideStatus: experiencePreferencesSchema.shape.guideStatus.removeDefault().optional(),
  communityDismissed: experiencePreferencesSchema.shape.communityDismissed.removeDefault().optional(),
}).strict().refine(v => Object.values(v).some(value => value !== undefined), 'Choose a preference to update.')
export const experienceResponseSchema = z.object({ preferences: experiencePreferencesSchema, saved: z.boolean() })
export type ExperiencePreferences = z.infer<typeof experiencePreferencesSchema>
export type ExperiencePatch = z.infer<typeof experiencePatchSchema>
export type ExperienceResponse = z.infer<typeof experienceResponseSchema>
export const hasPlaybackPreferences = (patch: ExperiencePatch) => ['audioLanguage', 'animeAudio', 'subtitlesEnabled', 'subtitleLanguages', 'qualityHeight', 'autoplayNextEpisode'].some(key => patch[key as keyof ExperiencePatch] !== undefined)
export const defaultExperiencePreferences = (): ExperiencePreferences => experiencePreferencesSchema.parse({})
