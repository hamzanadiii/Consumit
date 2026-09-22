import { z } from 'zod'

export const catalogKindSchema = z.enum(['movie', 'series', 'anime'])
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
  source: z.enum(['tmdb', 'anilist']),
  stale: z.boolean(),
})
export type CatalogResponseMeta = z.infer<typeof catalogResponseMetaSchema>

export const catalogTitleSummarySchema = catalogRefSchema.extend({
  backdropUrl: z.url().nullable(),
  genreNames: z.array(z.string()),
  logoUrl: z.url().nullable(),
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
  heroBackdropUrl: z.url().nullable(),
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

export const animeSeasonSchema = z.enum(['WINTER', 'SPRING', 'SUMMER', 'FALL'])
export type AnimeSeason = z.infer<typeof animeSeasonSchema>

export const animeFormatSchema = z.enum(['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT'])
export type AnimeFormat = z.infer<typeof animeFormatSchema>

export const animeStatusSchema = z.enum(['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'])
export type AnimeStatus = z.infer<typeof animeStatusSchema>

export const animeRelationTypeSchema = z.enum([
  'PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'CHARACTER', 'SUMMARY',
  'ALTERNATIVE', 'SPIN_OFF', 'OTHER', 'SOURCE', 'COMPILATION', 'CONTAINS',
])
export type AnimeRelationType = z.infer<typeof animeRelationTypeSchema>

export const animeTitleSchema = z.object({
  preferred: z.string().min(1),
  english: z.string().nullable(),
  romaji: z.string().nullable(),
  native: z.string().nullable(),
})
export type AnimeTitle = z.infer<typeof animeTitleSchema>

export const animeImageAssetSchema = z.object({
  url: z.url().nullable(),
  color: z.string().max(16).nullable(),
})
export type AnimeImageAsset = z.infer<typeof animeImageAssetSchema>

export const animeTitleSummarySchema = z.object({
  anilistId: z.int().positive(),
  kind: z.literal('anime'),
  titles: animeTitleSchema,
  format: animeFormatSchema,
  status: animeStatusSchema,
  season: animeSeasonSchema.nullable(),
  seasonYear: z.int().min(1870).max(2200).nullable(),
  episodes: z.int().positive().nullable(),
  episodeDuration: z.int().positive().nullable(),
  genres: z.array(z.string()),
  coverImage: animeImageAssetSchema,
  bannerImage: z.url().nullable(),
  averageScore: z.number().min(0).max(100).nullable(),
  popularity: z.int().nonnegative(),
  description: z.string(),
  nextAiringEpisode: z.object({
    episode: z.int().positive(),
    airingAt: z.iso.datetime(),
  }).nullable(),
})
export type AnimeTitleSummary = z.infer<typeof animeTitleSummarySchema>

export const animeCharacterSchema = z.object({
  id: z.int().positive(),
  name: z.string().min(1),
  image: z.url().nullable(),
  role: z.string().nullable(),
  voiceActors: z.array(z.object({
    id: z.int().positive(),
    name: z.string().min(1),
    image: z.url().nullable(),
    language: z.string().min(2),
  })),
})
export type AnimeCharacter = z.infer<typeof animeCharacterSchema>

export const animeStaffSchema = z.object({
  id: z.int().positive(),
  name: z.string().min(1),
  image: z.url().nullable(),
  role: z.string().nullable(),
})
export type AnimeStaff = z.infer<typeof animeStaffSchema>

export const animeTitleDetailSchema = animeTitleSummarySchema.extend({
  malId: z.int().positive().nullable(),
  source: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),
  trailer: z.object({
    id: z.string(),
    site: z.string(),
    thumbnail: z.url().nullable(),
  }).nullable(),
  characters: z.array(animeCharacterSchema),
  staff: z.array(animeStaffSchema),
  streamingEpisodes: z.array(z.object({
    title: z.string(),
    thumbnail: z.url().nullable(),
    site: z.string(),
  })),
  externalLinks: z.array(z.object({
    id: z.int().positive(),
    site: z.string(),
    url: z.url(),
    color: z.string().max(16).nullable(),
  })),
})
export type AnimeTitleDetail = z.infer<typeof animeTitleDetailSchema>

export const animeEpisodeSchema = z.object({
  anilistId: z.int().positive(),
  number: z.int().positive(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  thumbnail: z.url().nullable(),
  airDate: z.iso.date().nullable(),
  duration: z.int().positive().nullable(),
})
export type AnimeEpisode = z.infer<typeof animeEpisodeSchema>

export const animeSeasonSchema_v2 = z.object({
  season: animeSeasonSchema,
  year: z.int().min(1870).max(2200),
  episodeCount: z.int().nonnegative(),
})
export type AnimeSeason_v2 = z.infer<typeof animeSeasonSchema_v2>

export const animeFranchiseRelationSchema = z.object({
  type: animeRelationTypeSchema,
  anime: animeTitleSummarySchema,
})
export type AnimeFranchiseRelation = z.infer<typeof animeFranchiseRelationSchema>

export const animeFranchiseSchema = z.object({
  main: animeTitleSummarySchema,
  relations: z.array(animeFranchiseRelationSchema),
})
export type AnimeFranchise = z.infer<typeof animeFranchiseSchema>

export const animeAiringEpisodeSchema = z.object({
  episode: z.int().positive(),
  airingAt: z.iso.datetime(),
  timeUntilAiring: z.int().nonnegative(),
  mediaTitle: z.string().min(1),
})
export type AnimeAiringEpisode = z.infer<typeof animeAiringEpisodeSchema>

export const animeAiringScheduleSchema = z.object({
  episodes: z.array(animeAiringEpisodeSchema),
  page: z.int().positive(),
  totalPages: z.int().nonnegative(),
})
export type AnimeAiringSchedule = z.infer<typeof animeAiringScheduleSchema>

export const animePageSchema = z.object({
  items: z.array(animeTitleSummarySchema),
  page: z.int().positive(),
  totalPages: z.int().nonnegative(),
  totalResults: z.int().nonnegative(),
})
export type AnimePage = z.infer<typeof animePageSchema>

export const animeBatchSchema = z.object({
  items: z.array(animeTitleSummarySchema),
  missing: z.array(z.int().positive()),
})
export type AnimeBatch = z.infer<typeof animeBatchSchema>

export const animeSearchResultSchema = z.object({
  items: z.array(animeTitleSummarySchema),
  page: z.int().positive(),
  totalPages: z.int().nonnegative(),
  totalResults: z.int().nonnegative(),
})
export type AnimeSearchResult = z.infer<typeof animeSearchResultSchema>

export const animePlaybackRefSchema = z.object({
  kind: z.literal('anime'),
  anilistId: z.int().positive(),
  episode: z.int().min(1),
})
export type AnimePlaybackRef = z.infer<typeof animePlaybackRefSchema>

export const apiErrorCodeSchema = z.enum([
  'ANIME_NOT_FOUND',
  'ANILIST_UNAVAILABLE',
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
  'PLAYBACK_UNAVAILABLE',
  'RATE_LIMITED',
  'SUBTITLES_NOT_FOUND',
  'SUBTITLES_UNAVAILABLE',
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
  role: z.enum(['member', 'admin']),
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

export const favoriteSchema = memberTitleRecordSchema.extend({ position: z.int().min(1).max(6) })
export type Favorite = z.infer<typeof favoriteSchema>

export const favoriteSelectionRequestSchema = z.object({ favorites: z.array(catalogRefSchema).max(6) })
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
  rewatch: z.boolean().optional(),  tags: memberTagsSchema.optional(),
  watchedOn: z.iso.date().optional(),
}).refine(hasChange, 'Provide at least one diary change.')
export type UpdateDiaryEntryRequest = z.infer<typeof updateDiaryEntryRequestSchema>

export const createDiaryEntryRequestSchema = catalogRefSchema.extend({
  rewatch: z.boolean().optional(),
  tags: memberTagsSchema.optional(),
  watchedOn: z.iso.date(),
})
export type CreateDiaryEntryRequest = z.infer<typeof createDiaryEntryRequestSchema>

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
  favorites: z.array(favoriteSchema).max(6),
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

export const createReviewRequestSchema = catalogRefSchema.extend({
  body: z.string().trim().min(1).max(10_000),
  reviewedOn: z.iso.date().nullable().optional(),
})
export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>

export const titleReviewAuthorSchema = z.object({
  avatarStyle: avatarStyleSchema,
  avatarUrl: avatarUrlSchema.nullable(),
  displayName: z.string().nullable(),
  username: usernameSchema,
})
export type TitleReviewAuthor = z.infer<typeof titleReviewAuthorSchema>

export const reviewLikeSchema = z.object({
  likesCount: z.int().nonnegative(),
  reviewId: z.string().min(1),
})
export type ReviewLike = z.infer<typeof reviewLikeSchema>

export const setReviewLikeRequestSchema = z.object({
  reviewId: z.string().trim().min(1).max(128),
})
export type SetReviewLikeRequest = z.infer<typeof setReviewLikeRequestSchema>

export const titleReviewSchema = z.object({
  author: titleReviewAuthorSchema,
  body: z.string(),
  liked: z.boolean(),
  likesCount: z.int().nonnegative(),
  rating: z.int().min(1).max(10).nullable(),
  reviewId: z.string().min(1),
  reviewedOn: z.iso.date().nullable(),
})
export type TitleReview = z.infer<typeof titleReviewSchema>

export const titleReviewSortSchema = z.enum(['recent', 'popular'])
export type TitleReviewSort = z.infer<typeof titleReviewSortSchema>

export const titleReviewAudienceSchema = z.enum(['all', 'circle'])
export type TitleReviewAudience = z.infer<typeof titleReviewAudienceSchema>

export const followStateSchema = z.object({
  following: z.boolean(),
})
export type FollowState = z.infer<typeof followStateSchema>

export const followStatusSchema = z.object({
  followers: z.int().nonnegative(),
  following: z.boolean(),
})
export type FollowStatus = z.infer<typeof followStatusSchema>

export const titleReviewsPageSchema = z.object({
  items: z.array(titleReviewSchema).max(10),
  page: z.int().positive(),
  totalPages: z.int().nonnegative(),
  totalResults: z.int().nonnegative(),
})
export type TitleReviewsPage = z.infer<typeof titleReviewsPageSchema>

export const titleReviewsQuerySchema = z.object({
  audience: titleReviewAudienceSchema.optional().default('all'),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  sort: titleReviewSortSchema.optional().default('recent'),
})
export type TitleReviewsQuery = z.infer<typeof titleReviewsQuerySchema>

export const memberRatingSchema = memberTitleRecordSchema.extend({ value: z.int().min(1).max(10) })
export type MemberRating = z.infer<typeof memberRatingSchema>

export const setRatingRequestSchema = catalogRefSchema.extend({ value: z.int().min(1).max(10) })
export type SetRatingRequest = z.infer<typeof setRatingRequestSchema>

export const progressRefSchema = catalogRefSchema.extend({
  episode: z.int().min(0).max(10000).optional(),
  season: z.int().min(0).max(100).optional(),
})
export type ProgressRef = z.infer<typeof progressRefSchema>

export const playbackRefSchema = progressRefSchema.refine((ref) => {
  if (ref.kind === 'series') return ref.season !== undefined && ref.episode !== undefined && ref.episode > 0
  if (ref.kind === 'anime') return ref.episode !== undefined && ref.episode > 0
  return ref.season === undefined && ref.episode === undefined
}, 'Specify a movie, an exact series episode, or an anime episode.')
export const playbackCapabilitiesSchema = z.object({
  hls: z.boolean(), dash: z.boolean(), native: z.boolean(),
  nativeHls: z.boolean().default(false),
  maxHeight: z.int().min(240).max(4320).optional(),
})
export const resolvePlaybackRequestSchema = z.object({
  ref: playbackRefSchema,
  capabilities: playbackCapabilitiesSchema,
  audioLanguage: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).default('en'),
})
export const playbackTrackSchema = z.object({
  id: z.string().min(1).max(128), label: z.string().min(1).max(128),
  language: z.string().max(32), url: z.string().max(4096).refine((value) => /^https:\/\//.test(value)),
  format: z.enum(['vtt', 'srt', 'ass']),
})
export const skipSegmentSchema = z.object({
  kind: z.enum(['intro', 'outro', 'recap']),
  start: z.number().min(0).max(86400),
  end: z.number().min(0).max(86400),
})
export const playbackSourceSchema = z.object({
  id: z.string().min(1).max(160), providerId: z.string().min(1).max(80),
  type: z.enum(['hls', 'dash', 'native']), src: z.string().min(1).max(4096),
  qualityHint: z.string().min(1).max(24).optional(),
  expiresAt: z.iso.datetime(), subtitles: z.array(playbackTrackSchema).max(32).default([]),
  skipSegments: z.array(skipSegmentSchema).max(8).default([]),
})
export const playbackSessionSchema = z.object({
  id: z.string().uuid(), ref: playbackRefSchema, source: playbackSourceSchema,
  expiresAt: z.iso.datetime(), fallbackCount: z.int().min(0).max(3),
  capabilities: z.object({ refresh: z.boolean(), fallback: z.boolean(), externalSubtitles: z.boolean() }),
})
export const playbackFailureRequestSchema = z.object({
  sourceId: z.string().min(1).max(160), reason: z.enum(['network', 'media', 'expired', 'unsupported']),
})
export const playbackEventsSchema = z.object({ events: z.array(z.object({
  type: z.enum(['started', 'buffer-start', 'buffer-end', 'error', 'switched', 'ended']),
  position: z.number().min(0).max(86400), elapsedMs: z.number().min(0).max(86400000).optional(),
})).min(1).max(20) })
export const playbackSwitchRequestSchema = z.object({ providerId: z.string().min(1).max(80) })
export const playbackProviderSchema = z.object({
  id: z.string().min(1).max(80), label: z.string().min(1).max(80),
  detail: z.string().min(1).max(80).optional(),
  /** Mirror family (base adapter, e.g. `vidcore`) and mirror name (config
   *  suffix, e.g. `nova`, or `auto` for the whole-provider aggregate).
   *  The player groups the server menu by family so members choose between
   *  mirrors with their qualities instead of a flat provider list. */
  family: z.string().min(1).max(80).optional(),
  mirror: z.string().min(1).max(80).optional(),
  /** Approved serving regions (ISO-3166 alpha-2); the player renders the
   *  first as the server flag. Empty stays valid for older payloads. */
  regions: z.array(z.string().length(2)).max(10).default([]),
  /** Breaker-derived serving state: degraded while cooling down or
   *  repeatedly failing. The player shows it, never blocks on it. */
  health: z.enum(['ok', 'degraded']).default('ok'),
  /** Whether this provider answered for the title. The menu lists the
   *  whole fixed fleet; unavailable rows stay selectable so a tap attempts
   *  a fresh resolve and the player auto-advances on failure. */
  available: z.boolean().default(true),
  /** Direct caption tracks gathered from every provider that answered, ready
   *  for the player to merge with the active source's own tracks. */
  subtitles: z.array(playbackTrackSchema).max(32).default([]),
})
export const playbackProviderListSchema = z.object({ providers: z.array(playbackProviderSchema).max(64) })
/** Caption track served or validated by the subtitles module. Served
 *  entries point at first-party VTT files converted and cached by the API
 *  (same-origin absolute URLs, so the scheme follows the app origin);
 *  direct entries are upstream https WebVTT handed to the browser
 *  untouched. Hostile-output gating (https-only into playback sessions)
 *  stays downstream in the playback module. */
export const subtitleTrackSchema = playbackTrackSchema.extend({ url: z.string().url().max(4096) })
export type SubtitleTrack = z.infer<typeof subtitleTrackSchema>
/** Aggregated caption tracks for one title/episode, independent of the
 *  selected streaming provider. */
export const subtitlesResponseSchema = z.object({ subtitles: z.array(subtitleTrackSchema).max(32) })
export type SubtitlesResponse = z.infer<typeof subtitlesResponseSchema>
export type PlaybackRef = z.infer<typeof playbackRefSchema>
export type PlaybackSource = z.infer<typeof playbackSourceSchema>
export type PlaybackSession = z.infer<typeof playbackSessionSchema>
export type ResolvePlaybackRequest = z.infer<typeof resolvePlaybackRequestSchema>
export type PlaybackFailureRequest = z.infer<typeof playbackFailureRequestSchema>
export type PlaybackEvents = z.infer<typeof playbackEventsSchema>
export type PlaybackSwitchRequest = z.infer<typeof playbackSwitchRequestSchema>
export type PlaybackProvider = z.infer<typeof playbackProviderSchema>

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
  favorites: z.array(favoriteSchema).max(6),
  lists: z.array(memberListSummarySchema),
  profile: profileSchema,
  reviews: z.array(memberReviewSchema),
  social: z.object({ followers: z.int().nonnegative(), following: z.int().nonnegative() }),
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
  if (title.kind === 'anime') return `/anime/${title.id}`
  return title.kind === 'movie' ? `/title/${title.id}` : `/series/${title.id}`
}
export function reviewsHref(title: CatalogRef) {
  return `${titleHref(title)}/reviews`
}
export function watchHref(title: CatalogRef, episode?: { episode: number; season: number }) {
  if (title.kind === 'anime') return `/watch/anime/${title.id}?episode=${episode?.episode ?? 1}`
  if (title.kind === 'movie') return `/watch/movie/${title.id}`

  return `/watch/series/${title.id}?season=${episode?.season ?? 1}&episode=${episode?.episode ?? 1}`
}
