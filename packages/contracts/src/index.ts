import { z } from 'zod'

export const catalogKindSchema = z.enum(['movie', 'series'])
export type CatalogKind = z.infer<typeof catalogKindSchema>

export const catalogFeedSchema = z.enum([
  'trending',
  'popular',
  'top-rated',
  'now-playing',
  'on-air',
])
export type CatalogFeed = z.infer<typeof catalogFeedSchema>

export const catalogRefSchema = z.object({
  id: z.int().positive(),
  kind: catalogKindSchema,
})
export type CatalogRef = z.infer<typeof catalogRefSchema>

export const catalogResponseMetaSchema = z.object({
  fetchedAt: z.iso.datetime(),
  language: z.string().min(2),
  region: z.string().length(2),
  source: z.literal('tmdb'),
  stale: z.boolean(),
})
export type CatalogResponseMeta = z.infer<typeof catalogResponseMetaSchema>

export const catalogTitleSummarySchema = catalogRefSchema.extend({
  backdropUrl: z.url().nullable(),
  genreNames: z.array(z.string()),
  originalTitle: z.string().min(1),
  overview: z.string(),
  popularity: z.number().nonnegative(),
  posterUrl: z.url().nullable(),
  releaseDate: z.string().nullable(),
  title: z.string().min(1),
  tmdbRating: z.number().min(0).max(10).nullable(),
  tmdbVoteCount: z.int().nonnegative(),
  year: z.int().min(1870).max(2200).nullable(),
})
export type CatalogTitleSummary = z.infer<typeof catalogTitleSummarySchema>

export const catalogPersonSchema = z.object({
  character: z.string().nullable(),
  id: z.int().positive(),
  name: z.string().min(1),
  profileUrl: z.url().nullable(),
  role: z.string().nullable(),
})
export type CatalogPerson = z.infer<typeof catalogPersonSchema>

export const catalogSeasonSummarySchema = z.object({
  airDate: z.string().nullable(),
  episodeCount: z.int().nonnegative(),
  name: z.string().min(1),
  number: z.int().positive(),
  posterUrl: z.url().nullable(),
})
export type CatalogSeasonSummary = z.infer<typeof catalogSeasonSummarySchema>

const catalogDetailBaseSchema = catalogTitleSummarySchema.extend({
  cast: z.array(catalogPersonSchema),
  certification: z.string().nullable(),
  countries: z.array(z.string()),
  creators: z.array(catalogPersonSchema),
  homepageUrl: z.url().nullable(),
  languages: z.array(z.string()),
  recommendations: z.array(catalogTitleSummarySchema),
  status: z.string().nullable(),
  tagline: z.string().nullable(),
})

export const catalogMovieDetailSchema = catalogDetailBaseSchema.extend({
  kind: z.literal('movie'),
  runtimeMinutes: z.int().positive().nullable(),
})
export type CatalogMovieDetail = z.infer<typeof catalogMovieDetailSchema>

export const catalogSeriesDetailSchema = catalogDetailBaseSchema.extend({
  contentRating: z.string().nullable(),
  episodeRuntimeMinutes: z.int().positive().nullable(),
  kind: z.literal('series'),
  seasons: z.array(catalogSeasonSummarySchema),
})
export type CatalogSeriesDetail = z.infer<typeof catalogSeriesDetailSchema>

export const catalogTitleDetailSchema = z.discriminatedUnion('kind', [
  catalogMovieDetailSchema,
  catalogSeriesDetailSchema,
])
export type CatalogTitleDetail = z.infer<typeof catalogTitleDetailSchema>

export const catalogEpisodeSchema = z.object({
  airDate: z.string().nullable(),
  episodeNumber: z.int().positive(),
  id: z.int().positive(),
  overview: z.string(),
  runtimeMinutes: z.int().positive().nullable(),
  seasonNumber: z.int().positive(),
  stillUrl: z.url().nullable(),
  title: z.string().min(1),
})
export type CatalogEpisode = z.infer<typeof catalogEpisodeSchema>

export const catalogSeasonSchema = z.object({
  episodes: z.array(catalogEpisodeSchema),
  name: z.string().min(1),
  overview: z.string(),
  posterUrl: z.url().nullable(),
  seasonNumber: z.int().positive(),
  seriesId: z.int().positive(),
})
export type CatalogSeason = z.infer<typeof catalogSeasonSchema>

export const catalogPageSchema = z.object({
  items: z.array(catalogTitleSummarySchema),
  meta: catalogResponseMetaSchema,
  page: z.int().positive(),
  totalPages: z.int().nonnegative(),
  totalResults: z.int().nonnegative(),
})
export type CatalogPage = z.infer<typeof catalogPageSchema>

export const catalogBatchSchema = z.object({
  items: z.array(catalogTitleSummarySchema),
  meta: catalogResponseMetaSchema,
  missing: z.array(catalogRefSchema),
})
export type CatalogBatch = z.infer<typeof catalogBatchSchema>

export const catalogTitleResponseSchema = z.object({
  item: catalogTitleDetailSchema,
  meta: catalogResponseMetaSchema,
})
export type CatalogTitleResponse = z.infer<typeof catalogTitleResponseSchema>

export const catalogSeasonResponseSchema = z.object({
  item: catalogSeasonSchema,
  meta: catalogResponseMetaSchema,
})
export type CatalogSeasonResponse = z.infer<typeof catalogSeasonResponseSchema>

export const apiErrorCodeSchema = z.enum([
  'AUTH_STATE_UNAVAILABLE',
  'BAD_REQUEST',
  'CATALOG_INVALID_QUERY',
  'CATALOG_NOT_CONFIGURED',
  'CATALOG_NOT_FOUND',
  'CATALOG_UNAVAILABLE',
  'CONFLICT',
  'EMAIL_DELIVERY_UNAVAILABLE',
  'EMAIL_NOT_VERIFIED',
  'FORBIDDEN',
  'IDENTITY_NOT_CONFIGURED',
  'IMPORT_INVALID_ARCHIVE',
  'IMPORT_LIMIT_EXCEEDED',
  'IMPORT_NOT_FOUND',
  'IMPORT_NOT_READY',
  'IMPORT_UNAVAILABLE',
  'INTERNAL',
  'INVALID_CREDENTIALS',
  'INVALID_VERIFICATION_CODE',
  'NOT_FOUND',
  'PASSWORD_INVALID',
  'RATE_LIMITED',
  'UNAUTHENTICATED',
  'USERNAME_CHANGE_COOLDOWN',
  'USERNAME_UNAVAILABLE',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(8).max(64),
    retryable: z.boolean(),
  }),
})
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
export type Email = z.infer<typeof emailSchema>

export const passwordSchema = z.string().min(12).max(128)
export type Password = z.infer<typeof passwordSchema>

export const credentialSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})
export type Credential = z.infer<typeof credentialSchema>

const reservedUsernames = new Set(['admin', 'consumit', 'moderator', 'staff', 'support', 'system'])

export const usernameSchema = z.string()
  .trim()
  .toLowerCase()
  .pipe(z.string().min(3).max(30).regex(/^[a-z0-9_]+$/))
  .refine((username) => !reservedUsernames.has(username), 'This username is reserved.')
export type Username = z.infer<typeof usernameSchema>

export const registerRequestSchema = credentialSchema.extend({ username: usernameSchema })
export type RegisterRequest = z.infer<typeof registerRequestSchema>

export const loginRequestSchema = credentialSchema
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const avatarStyleSchema = z.enum(['dusk', 'dawn', 'noir', 'halo'])
export type AvatarStyle = z.infer<typeof avatarStyleSchema>

export const avatarUrlSchema = z.string().trim().min(1).max(500).refine(
  (value) => value.startsWith('https://') || value.startsWith('http://'),
  'Use an http(s) avatar address.',
)

export const bannerUrlSchema = z.string().trim().min(1).max(500).refine(
  (value) => value.startsWith('https://image.tmdb.org/'),
  'Use a TMDB artwork address.',
)

export const safeMemberSchema = z.object({
  avatarStyle: avatarStyleSchema,
  avatarUrl: avatarUrlSchema.nullable(),
  createdAt: z.iso.datetime(),
  displayName: z.string().min(1).max(80).nullable(),
  email: emailSchema,
  emailVerified: z.boolean(),
  id: z.string().min(1),
  username: usernameSchema,
})
export type SafeMember = z.infer<typeof safeMemberSchema>

export const profileVisibilitySchema = z.enum(['private', 'public'])
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>

const optionalProfileText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable().optional()

export const updateProfileRequestSchema = z.object({
  avatarStyle: avatarStyleSchema.optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
  bannerUrl: bannerUrlSchema.nullable().optional(),
  bio: optionalProfileText(500),
  displayName: optionalProfileText(80),
  location: optionalProfileText(100),
  username: usernameSchema.optional(),
  visibility: profileVisibilitySchema.optional(),
}).refine((profile) => Object.values(profile).some((value) => value !== undefined), 'Provide at least one profile change.')
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>

export const profileSchema = z.object({
  avatarStyle: avatarStyleSchema,
  avatarUrl: avatarUrlSchema.nullable(),
  bannerUrl: bannerUrlSchema.nullable(),
  bio: z.string().nullable(),
  createdAt: z.iso.datetime(),
  displayName: z.string().nullable(),
  location: z.string().nullable(),
  nextUsernameChangeAt: z.iso.datetime().nullable(),
  username: usernameSchema,
  usernameChangedAt: z.iso.datetime().nullable(),
  visibility: profileVisibilitySchema,
})
export type MemberProfile = z.infer<typeof profileSchema>

export const profileResponseSchema = z.object({
  canonicalUsername: usernameSchema,
  profile: profileSchema,
})
export type ProfileResponse = z.infer<typeof profileResponseSchema>

export const usernameAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  username: usernameSchema,
})
export type UsernameAvailabilityResponse = z.infer<typeof usernameAvailabilityResponseSchema>

export const sessionMemberResponseSchema = z.object({
  member: safeMemberSchema,
})
export type SessionMemberResponse = z.infer<typeof sessionMemberResponseSchema>

export const acceptedResponseSchema = z.object({
  message: z.string().min(1),
  status: z.literal('accepted'),
})
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>

export const emailRequestSchema = z.object({ email: emailSchema })
export type EmailRequest = z.infer<typeof emailRequestSchema>

export const verificationCodeSchema = z.string().regex(/^\d{6}$/)
export const verifyEmailRequestSchema = emailRequestSchema.extend({ code: verificationCodeSchema })
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>

export const recoveryConfirmRequestSchema = verifyEmailRequestSchema.extend({ newPassword: passwordSchema })
export type RecoveryConfirmRequest = z.infer<typeof recoveryConfirmRequestSchema>

export const passwordChangeRequestSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
})
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>

export const accountDeletionRequestSchema = z.object({ password: passwordSchema })
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>

export const recordOriginSchema = z.enum(['native', 'letterboxd'])
export type RecordOrigin = z.infer<typeof recordOriginSchema>

export const memberTitleRecordSchema = catalogRefSchema.extend({
  origin: recordOriginSchema,
  sourceKey: z.string().min(1).nullable(),
})
export type MemberTitleRecord = z.infer<typeof memberTitleRecordSchema>

export const favoriteSchema = memberTitleRecordSchema.extend({ position: z.int().min(1).max(4) })
export type Favorite = z.infer<typeof favoriteSchema>

export const favoriteSelectionRequestSchema = z.object({ favorites: z.array(catalogRefSchema).max(4) })
export type FavoriteSelectionRequest = z.infer<typeof favoriteSelectionRequestSchema>

export const diaryEntrySchema = memberTitleRecordSchema.extend({
  entryId: z.string().min(1),
  rewatch: z.boolean(),
  tags: z.array(z.string()),
  watchedOn: z.iso.date(),
})
export type DiaryEntry = z.infer<typeof diaryEntrySchema>

const memberTagsSchema = z.array(z.string().trim().min(1).max(100)).max(50)
const hasChange = (value: Record<string, unknown>) => Object.values(value).some((entry) => entry !== undefined)

export const updateDiaryEntryRequestSchema = z.object({
  rewatch: z.boolean().optional(),
  tags: memberTagsSchema.optional(),
  watchedOn: z.iso.date().optional(),
}).refine(hasChange, 'Provide at least one diary change.')
export type UpdateDiaryEntryRequest = z.infer<typeof updateDiaryEntryRequestSchema>

export const memberListSummarySchema = z.object({
  description: z.string().nullable(),
  id: z.string().min(1),
  itemCount: z.int().nonnegative(),
  name: z.string().min(1).max(120),
  origin: recordOriginSchema,
  slug: z.string().min(1).max(160),
  visibility: profileVisibilitySchema,
})
export type MemberListSummary = z.infer<typeof memberListSummarySchema>

export const updateMemberListRequestSchema = z.object({
  description: z.string().trim().min(1).max(2_000).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  visibility: profileVisibilitySchema.optional(),
}).refine(hasChange, 'Provide at least one list change.')
export type UpdateMemberListRequest = z.infer<typeof updateMemberListRequestSchema>

export const memberLibrarySchema = z.object({
  diary: z.array(diaryEntrySchema),
  favorites: z.array(favoriteSchema).max(4),
  lists: z.array(memberListSummarySchema),
  saved: z.array(memberTitleRecordSchema),
  watched: z.array(memberTitleRecordSchema),
})
export type MemberLibrary = z.infer<typeof memberLibrarySchema>

export const memberReviewSchema = memberTitleRecordSchema.extend({
  body: z.string(),
  reviewId: z.string().min(1),
  reviewedOn: z.iso.date().nullable(),
  tags: z.array(z.string()),
})
export type MemberReview = z.infer<typeof memberReviewSchema>

export const updateMemberReviewRequestSchema = z.object({
  body: z.string().trim().min(1).max(10_000).optional(),
  reviewedOn: z.iso.date().nullable().optional(),
  tags: memberTagsSchema.optional(),
}).refine(hasChange, 'Provide at least one review change.')
export type UpdateMemberReviewRequest = z.infer<typeof updateMemberReviewRequestSchema>

export const memberRatingSchema = memberTitleRecordSchema.extend({ value: z.int().min(1).max(10) })
export type MemberRating = z.infer<typeof memberRatingSchema>

export const progressRefSchema = catalogRefSchema.extend({
  episode: z.int().min(0).max(1000).optional(),
  season: z.int().min(0).max(100).optional(),
})
export type ProgressRef = z.infer<typeof progressRefSchema>

export const progressWriteRequestSchema = progressRefSchema.extend({
  completed: z.boolean().optional(),
  durationSeconds: z.int().min(1).max(86400).optional(),
  positionSeconds: z.int().min(0).max(86400),
})
export type ProgressWriteRequest = z.infer<typeof progressWriteRequestSchema>

export const playbackProgressSchema = progressRefSchema.extend({
  completed: z.boolean(),
  durationSeconds: z.int().min(1).max(86400).nullable(),
  positionSeconds: z.int().min(0).max(86400),
  updatedAt: z.iso.datetime(),
})
export type PlaybackProgress = z.infer<typeof playbackProgressSchema>

export const memberProfileDataSchema = z.object({
  canonicalUsername: usernameSchema,
  diary: z.array(diaryEntrySchema),
  favorites: z.array(favoriteSchema).max(4),
  lists: z.array(memberListSummarySchema),
  profile: profileSchema,
  reviews: z.array(memberReviewSchema),
  social: z.object({ followers: z.literal(0), following: z.literal(0) }),
  statistics: z.object({
    diaryEntries: z.int().nonnegative(),
    lists: z.int().nonnegative(),
    reviews: z.int().nonnegative(),
    watched: z.int().nonnegative(),
  }),
})
export type MemberProfileData = z.infer<typeof memberProfileDataSchema>

export const memberListDetailSchema = z.object({
  items: z.array(memberTitleRecordSchema.extend({ note: z.string().nullable(), position: z.int().positive() })),
  list: memberListSummarySchema,
  owner: z.object({ displayName: z.string().nullable(), username: usernameSchema }),
})
export type MemberListDetail = z.infer<typeof memberListDetailSchema>

export const letterboxdImportStatusSchema = z.enum(['uploaded', 'processing', 'needs_review', 'ready', 'confirmed', 'failed'])
export type LetterboxdImportStatus = z.infer<typeof letterboxdImportStatusSchema>

export const letterboxdMatchStatusSchema = z.enum(['exact', 'confident', 'needs_review', 'unmatched', 'skipped'])
export type LetterboxdMatchStatus = z.infer<typeof letterboxdMatchStatusSchema>

export const letterboxdRowKindSchema = z.enum(['profile', 'watched', 'diary', 'rating', 'review', 'watchlist', 'favorite', 'list_item'])
export type LetterboxdRowKind = z.infer<typeof letterboxdRowKindSchema>

export const letterboxdImportProgressSchema = z.object({
  confident: z.int().nonnegative(),
  exact: z.int().nonnegative(),
  needsReview: z.int().nonnegative(),
  skipped: z.int().nonnegative(),
  total: z.int().nonnegative(),
  unmatched: z.int().nonnegative(),
})

export const letterboxdImportSchema = z.object({
  confirmedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  failedReason: z.string().nullable(),
  id: z.string().min(1),
  progress: letterboxdImportProgressSchema,
  status: letterboxdImportStatusSchema,
  updatedAt: z.iso.datetime(),
})
export type LetterboxdImport = z.infer<typeof letterboxdImportSchema>

export const letterboxdCandidateSchema = z.object({
  id: z.int().positive(),
  posterUrl: z.url().nullable(),
  title: z.string().min(1),
  year: z.int().min(1870).max(2200).nullable(),
})

export const letterboxdImportItemSchema = z.object({
  candidates: z.array(letterboxdCandidateSchema),
  id: z.string().min(1),
  kind: letterboxdRowKindSchema,
  selected: catalogRefSchema.nullable(),
  sourceKey: z.string().min(1),
  status: letterboxdMatchStatusSchema,
  title: z.string().nullable(),
  year: z.int().min(1870).max(2200).nullable(),
})
export type LetterboxdImportItem = z.infer<typeof letterboxdImportItemSchema>

export const letterboxdImportDetailSchema = z.object({
  import: letterboxdImportSchema,
  items: z.array(letterboxdImportItemSchema),
})
export type LetterboxdImportDetail = z.infer<typeof letterboxdImportDetailSchema>

export const letterboxdImportHistorySchema = z.object({ imports: z.array(letterboxdImportSchema) })
export const letterboxdMatchSelectionSchema = z.object({ skip: z.boolean().optional(), tmdbId: z.int().positive().optional() })
  .refine((value) => value.skip === true || value.tmdbId !== undefined, 'Choose a TMDB movie or skip this row.')
export type LetterboxdMatchSelection = z.infer<typeof letterboxdMatchSelectionSchema>

export const memberExportSchema = z.object({
  exportedAt: z.iso.datetime(),
  imports: z.array(letterboxdImportSchema),
  library: memberLibrarySchema,
  member: safeMemberSchema,
  profile: profileSchema.omit({ createdAt: true, nextUsernameChangeAt: true }),
  ratings: z.array(memberRatingSchema),
  reviews: z.array(memberReviewSchema),
})
export type MemberExport = z.infer<typeof memberExportSchema>

export function titleHref(title: CatalogRef) {
  return title.kind === 'movie' ? `/title/${title.id}` : `/series/${title.id}`
}
export function watchHref(title: CatalogRef, episode?: { episode: number; season: number }) {
  if (title.kind === 'movie') return `/watch/movie/${title.id}`

  return `/watch/series/${title.id}?season=${episode?.season ?? 1}&episode=${episode?.episode ?? 1}`
}
