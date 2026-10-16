import { z } from 'zod'
export type ProviderState = z.infer<typeof providerStateSchema>
import { playbackRefSchema, providerRoleSchema, providerDeliveryModeSchema, animeTitleDetailSchema } from './index'

const providerId = z.string().regex(/^[a-z0-9-]{1,64}$/)
export const providerOverrideSchema = z.strictObject({ removed: z.boolean().optional(), enabled: z.boolean().optional(), role: providerRoleSchema.optional(), deliveryMode: providerDeliveryModeSchema.optional(), priority: z.int().min(0).max(100).optional(), order: z.strictObject({ movie: z.int().min(0).max(63).optional(), series: z.int().min(0).max(63).optional(), anime: z.int().min(0).max(63).optional() }).optional(), regions: z.array(z.string().regex(/^[A-Z]{2}$/)).max(16).optional(), requestsPerMinute: z.int().min(1).max(120).optional(), concurrency: z.int().min(1).max(4).optional() })
export const providerStateSchema = z.strictObject({ revision: z.int().nonnegative(), overrides: z.record(providerId, providerOverrideSchema).refine(rows => Object.keys(rows).length <= 64) })
export const catalogContextRequestSchema = z.strictObject({ mode: z.enum(['worker', 'anime', 'tmdb']), ref: playbackRefSchema, providerId: providerId.optional() })
export const resolverMetadataSchema = z.strictObject({ title: z.string().max(300).optional(), year: z.int().min(1900).max(2100).optional(), imdbId: z.string().regex(/^tt\d{5,12}$/).optional(), runtimeSec: z.number().positive().optional(), animeTitle: z.string().max(500).optional(), animeTitles: z.array(z.string().max(500)).max(32).optional(), malId: z.number().int().positive().nullable().optional() })
export const animeContextSchema = animeTitleDetailSchema
export const subtitleCatalogRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('find'), ref: playbackRefSchema, langs: z.array(z.string().max(32)).max(10) }),
  z.strictObject({ operation: z.literal('save'), ref: playbackRefSchema, tracks: z.array(z.strictObject({ language: z.string().max(32), label: z.string().max(500), format: z.enum(['vtt', 'srt', 'ass']), provider: z.string().max(64), storageKey: z.string().regex(/^[a-f0-9]{16}$/), originalExt: z.string().max(8).optional(), vtt: z.string().max(1024 * 1024), hi: z.boolean().optional(), rating: z.number().optional(), releaseTag: z.string().max(500).optional() })).max(50) }),
])
export const subtitleCatalogRowsSchema = z.array(z.strictObject({ language: z.string().max(32), label: z.string().max(500), format: z.enum(['vtt', 'srt', 'ass']), provider: z.string().max(64), storageKey: z.string().regex(/^[a-f0-9]{16}$/), originalExt: z.string().nullable(), hi: z.boolean(), rating: z.number().nullable(), releaseTag: z.string().nullable() })).max(500)
export const adminDiagnosticPathSchema = z.string().max(200).refine(path => /^\/v1\/admin\/(?:subtitles(?:\/test)?|providers\/(?:health|test|inspect)|providers\/[a-z0-9-]{1,64}\/(?:retest|circuit\/reset))$/.test(path))
export const diagnosticRequestSchema = z.strictObject({ path: adminDiagnosticPathSchema, method: z.enum(['GET', 'POST']), body: z.unknown().optional() })
export const diagnosticResponseSchema = z.strictObject({ statusCode: z.int().min(200).max(599), body: z.unknown() })
const diagnosticKind = z.enum(['movie', 'series', 'anime'])
// Playback resolves these operations directly against its runtime. No admin
// surface, synthetic member, or path re-injection is exposed on the playback
// process; the product API authenticates the admin and forwards a typed op.
export const diagnosticOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('subtitles.list') }),
  z.strictObject({ operation: z.literal('subtitles.test'), ref: playbackRefSchema }),
  z.strictObject({ operation: z.literal('providers.health') }),
  z.strictObject({ operation: z.literal('providers.test'), providerId, ref: playbackRefSchema, audioLanguage: z.string().max(32).optional() }),
  z.strictObject({ operation: z.literal('providers.inspect'), providerId, ref: playbackRefSchema, audioLanguage: z.string().max(32).default('en'), scope: z.enum(['configured', 'scout']).default('configured') }),
  z.strictObject({ operation: z.literal('providers.retest'), providerId, region: z.string().regex(/^[A-Z]{2}$/).optional(), kind: diagnosticKind.optional() }),
  z.strictObject({ operation: z.literal('providers.circuit-reset'), providerId, kind: diagnosticKind }),
])
export type DiagnosticOperation = z.infer<typeof diagnosticOperationSchema>
export const providerAttemptSchema = z.strictObject({ providerId, ref: playbackRefSchema, region: z.string().regex(/^[A-Z]{2}$/), audioLanguage: z.string().max(32) })
export const backgroundOperationSchema = z.strictObject({ operation: z.enum(['release.refresh', 'catalog.cleanup', 'provider.refresh', 'provider.probe']) })
const traceparent = z.string().regex(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/).optional()
export const outboxPayloadSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('release.tracking.v1'), titles: z.array(z.strictObject({ kind: z.enum(['series', 'anime']), id: z.int().positive() })).max(50), traceparent }),
  z.strictObject({ type: z.literal('provider.config.v1'), providerId, revision: z.int().nonnegative(), traceparent }),
])
export const jobEnvelopeSchema = z.strictObject({ id: z.uuid(), version: z.literal(1), payload: outboxPayloadSchema })
