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
  /** Hero logo resolved from TMDB when the title matches confidently;
   *  null renders the serif title. Never blocks detail on failure. */
  logoUrl: z.url().nullable(),
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
  recommendations: z.array(animeTitleSummarySchema),
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
/** Confident AniList match for a TMDB title. 404 carries no body match â€”
 *  the caller keeps the honest TMDB page. */
export const animeMatchSchema = z.object({ anilistId: z.int().positive() })
export type AnimeMatch = z.infer<typeof animeMatchSchema>
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

export const animeBrowseSortSchema = z.enum(['popular', 'top-rated', 'new', 'old'])
export type AnimeBrowseSort = z.infer<typeof animeBrowseSortSchema>
/** Server-driven anime discovery: an AniList sort plus genre, year, and
 *  format filters. Genre is an AniList genre name; unknown values return an
 *  empty page rather than an error. */
export const animeBrowseQuerySchema = z.object({
  sort: animeBrowseSortSchema.default('popular'),
  genre: z.string().trim().min(1).max(64).optional(),
  year: z.int().min(1917).max(2200).optional(),
  format: animeFormatSchema.optional(),
  page: z.int().min(1).max(500).default(1),
})
export type AnimeBrowseQuery = z.infer<typeof animeBrowseQuerySchema>

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

export const profileVisibilitySchema = z.literal('private')
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

export const diaryRefSchema = catalogRefSchema.extend({
  episode: z.int().min(1).max(10000).optional(),
  season: z.int().min(0).max(100).optional(),
}).superRefine((ref, context) => {
  const hasEpisodeIdentity = ref.season !== undefined || ref.episode !== undefined
  if (!hasEpisodeIdentity) return
  if (ref.kind === 'movie') {
    context.addIssue({ code: 'custom', message: 'Movies cannot have episode identity.', path: ['episode'] })
    return
  }
  if (ref.kind === 'series' && (ref.season === undefined || ref.episode === undefined)) {
    context.addIssue({ code: 'custom', message: 'Series diary entries need both a season and episode.', path: ['episode'] })
    return
  }
  if (ref.kind === 'anime' && ref.episode === undefined) {
    context.addIssue({ code: 'custom', message: 'Anime diary entries need an episode number.', path: ['episode'] })
  }
})
export type DiaryRef = z.infer<typeof diaryRefSchema>

export const memberDiaryRecordSchema = diaryRefSchema.extend({
  origin: recordOriginSchema,
  sourceKey: z.string().min(1).nullable(),
})

export const MAX_MEMBER_FAVORITES = 4

export const favoriteSchema = memberTitleRecordSchema.extend({ position: z.int().min(1).max(MAX_MEMBER_FAVORITES) })
export type Favorite = z.infer<typeof favoriteSchema>

export const favoriteSelectionRequestSchema = z.object({ favorites: z.array(catalogRefSchema).max(MAX_MEMBER_FAVORITES) })
export type FavoriteSelectionRequest = z.infer<typeof favoriteSelectionRequestSchema>

export const diaryEntrySchema = memberDiaryRecordSchema.extend({
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

export const createDiaryEntryRequestSchema = diaryRefSchema.extend({
  idempotencyKey: z.uuid(),
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

export const createMemberListRequestSchema = z.object({
  description: z.string().trim().max(2_000).nullable().optional(),
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(1).max(120),
  visibility: profileVisibilitySchema.default('private'),
})
export type CreateMemberListRequest = z.infer<typeof createMemberListRequestSchema>

export const memberListItemsRequestSchema = z.object({
  items: z.array(catalogRefSchema.extend({ note: z.string().trim().max(500).nullable().optional() })).max(500),
}).refine(({ items }) => new Set(items.map(({ id, kind }) => `${kind}:${id}`)).size === items.length, 'A list cannot contain the same title twice.')
export type MemberListItemsRequest = z.infer<typeof memberListItemsRequestSchema>

export const updateMemberListContentRequestSchema = z.object({
  description: z.string().trim().max(2_000).nullable(),
  items: memberListItemsRequestSchema.shape.items,
  name: z.string().trim().min(1).max(120),
  visibility: profileVisibilitySchema,
}).refine(({ items }) => new Set(items.map(({ id, kind }) => `${kind}:${id}`)).size === items.length, 'A list cannot contain the same title twice.')
export type UpdateMemberListContentRequest = z.infer<typeof updateMemberListContentRequestSchema>

export const memberListOwnerSchema = z.object({ displayName: z.string().nullable(), username: usernameSchema })






export const updateMemberListRequestSchema = z.object({
  description: z.string().trim().min(1).max(2_000).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  visibility: profileVisibilitySchema.optional(),
}).refine(hasChange, 'Provide at least one list change.')
export type UpdateMemberListRequest = z.infer<typeof updateMemberListRequestSchema>

export const memberLibrarySchema = z.object({
  diary: z.array(diaryEntrySchema),
  favorites: z.array(favoriteSchema).max(MAX_MEMBER_FAVORITES),
  lists: z.array(memberListSummarySchema),
  
  saved: z.array(memberTitleRecordSchema),
  watched: z.array(memberTitleRecordSchema),
})
export type MemberLibrary = z.infer<typeof memberLibrarySchema>

const memberLibraryPageCursorSchema = z.string().min(1).max(128).nullable()
export const memberLibraryTitlePageSchema = z.object({ items: z.array(memberTitleRecordSchema).max(50), nextCursor: memberLibraryPageCursorSchema })
export const memberLibraryDiaryPageSchema = z.object({ items: z.array(diaryEntrySchema).max(50), nextCursor: memberLibraryPageCursorSchema })
export const memberLibraryListsPageSchema = z.object({ items: z.array(memberListSummarySchema).max(50), nextCursor: memberLibraryPageCursorSchema })

export const memberLibrarySnapshotSchema = z.object({
  diary: memberLibraryDiaryPageSchema,
  favorites: z.array(favoriteSchema).max(MAX_MEMBER_FAVORITES),
  lists: memberLibraryListsPageSchema,
  
  saved: memberLibraryTitlePageSchema,
})
export type MemberLibrarySnapshot = z.infer<typeof memberLibrarySnapshotSchema>

export const memberLibraryCollectionSchema = z.enum(['diary', 'lists', 'saved'])
export type MemberLibraryCollection = z.infer<typeof memberLibraryCollectionSchema>
export const memberLibraryPageQuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
})
export const memberLibraryCollectionPageSchema = z.discriminatedUnion('collection', [
  z.object({ collection: z.literal('diary'), items: z.array(diaryEntrySchema).max(50), nextCursor: memberLibraryPageCursorSchema }),
  z.object({ collection: z.literal('lists'), items: z.array(memberListSummarySchema).max(50), nextCursor: memberLibraryPageCursorSchema }),
  z.object({ collection: z.literal('saved'), items: z.array(memberTitleRecordSchema).max(50), nextCursor: memberLibraryPageCursorSchema }),
])
export type MemberLibraryCollectionPage = z.infer<typeof memberLibraryCollectionPageSchema>

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







export const titleReviewSchema = z.object({
  author: titleReviewAuthorSchema,
  body: z.string(),
  
  rating: z.int().min(1).max(10).nullable(),
  reviewId: z.string().min(1),
  reviewedOn: z.iso.date().nullable(),
})
export type TitleReview = z.infer<typeof titleReviewSchema>

export const titleReviewSortSchema = z.literal('recent')
export type TitleReviewSort = z.infer<typeof titleReviewSortSchema>



























export const titleReviewsPageSchema = z.object({
  items: z.array(titleReviewSchema).max(10),
  page: z.int().positive(),
  totalPages: z.int().nonnegative(),
  totalResults: z.int().nonnegative(),
})
export type TitleReviewsPage = z.infer<typeof titleReviewsPageSchema>

export const titleReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  sort: titleReviewSortSchema.optional().default('recent'),
})
export type TitleReviewsQuery = z.infer<typeof titleReviewsQuerySchema>

export const memberRatingSchema = memberTitleRecordSchema.extend({ value: z.int().min(1).max(10) })
export type MemberRating = z.infer<typeof memberRatingSchema>
export const memberRatingCursorSchema = z.object({ id: z.string().min(1).max(128), updatedAt: z.iso.datetime(), value: z.int().min(1).max(10) })
export const memberRatingPageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
  value: z.coerce.number().int().min(1).max(10),
})
export const memberRatingPageSchema = z.object({ items: z.array(memberRatingSchema).max(50), nextCursor: z.string().max(512).nullable(), totalCount: z.int().nonnegative() })
export type MemberRatingPage = z.infer<typeof memberRatingPageSchema>
export const memberRatingLookupRequestSchema = z.object({ titles: z.array(catalogRefSchema).min(1).max(50) })
export const memberRatingLookupQuerySchema = z.object({ titles: z.string().min(1).max(2048) })
export const memberRatingLookupResponseSchema = z.array(memberRatingSchema).max(50)

/** One member's stored state for title actions. Nullable records mean "never
 * set"; explicit saved/watched flags hydrate shelf controls in this same read. */
export const memberTitleStateSchema = z.object({
  rating: memberRatingSchema.nullable(),
  like: memberTitleRecordSchema.nullable(),
  review: memberReviewSchema.nullable(),
  saved: z.boolean(),
  watched: z.boolean(),
})
export type MemberTitleState = z.infer<typeof memberTitleStateSchema>

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
export const providerRoleSchema = z.enum(['video', 'audio', 'both'])
export type ProviderRole = z.infer<typeof providerRoleSchema>
export const playbackPreferencesSchema = z.object({
  qualityHeight: z.int().min(144).max(4320).nullable().optional(),
  audioLanguage: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).optional(),
})
export type PlaybackPreferences = z.infer<typeof playbackPreferencesSchema>
export const separateAudioTrackSchema = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), label: z.string().min(1).max(128), language: z.string().min(2).max(32), provider: z.string().min(1).max(80) })
export type SeparateAudioTrack = z.infer<typeof separateAudioTrackSchema>
export const separateAudioListSchema = z.object({ tracks: z.array(separateAudioTrackSchema).max(40) })
export const separateAudioSourceSchema = separateAudioTrackSchema.extend({ src: z.url().max(4096).refine(url => url.startsWith('https://')), duration: z.number().positive().max(86400), expiresAt: z.iso.datetime() })
export type SeparateAudioSource = z.infer<typeof separateAudioSourceSchema>
export const resolvePlaybackRequestSchema = z.object({
  ref: playbackRefSchema,
  capabilities: playbackCapabilitiesSchema,
  audioLanguage: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).default('en'),
  providerId: z.string().min(1).max(80).optional(),
  preferences: playbackPreferencesSchema.optional(),
})
export const playbackTrackSchema = z.object({
  id: z.string().min(1).max(128), label: z.string().min(1).max(128),
  language: z.string().max(32), url: z.string().max(4096).refine((value) => /^https:\/\//.test(value)),
  format: z.enum(['vtt', 'srt', 'ass']),
  /** Member-facing track attributes, detected from upstream filenames and
   *  labels: foreign-parts-only, hearing-impaired, signs/songs adjuncts,
   *  machine translations, and the engine's top pick per wanted language. */
  forced: z.boolean().optional(),
  sdh: z.boolean().optional(),
  signs: z.boolean().optional(),
  songs: z.boolean().optional(),
  machineTranslated: z.boolean().optional(),
  recommended: z.boolean().optional(),
})
export const skipSegmentSchema = z.object({
  kind: z.enum(['intro', 'outro', 'recap']),
  start: z.number().min(0).max(86400),
  end: z.number().min(0).max(86400),
})
export const playbackDeliverySchema = z.enum(['direct', 'relay', 'embed'])
export type PlaybackDelivery = z.infer<typeof playbackDeliverySchema>
/** Provider pool assignment; Proxy uses the independently approved relay. */
export const providerDeliveryModeSchema = z.enum(['direct', 'relay', 'embed'])
export type ProviderDeliveryMode = z.infer<typeof providerDeliveryModeSchema>
/** Browser delivery failures guide renewal and provider fallback. */
export const deliveryFailureSchema = z.enum(['cors', 'manifest', 'segment', 'forbidden', 'timeout', 'headers', 'unstable', 'manual'])
export type DeliveryFailure = z.infer<typeof deliveryFailureSchema>
export const playbackSourceSchema = z.object({
  id: z.string().min(1).max(160), providerId: z.string().min(1).max(80),
  type: z.enum(['hls', 'dash', 'native', 'iframe']), src: z.string().min(1).max(4096),
  qualityHint: z.string().min(1).max(24).optional(),
  qualityHeights: z.array(z.int().min(144).max(4320)).max(32).optional(),
  delivery: playbackDeliverySchema.default('direct'),
  expiresAt: z.iso.datetime(), subtitles: z.array(playbackTrackSchema).max(32).default([]),
  skipSegments: z.array(skipSegmentSchema).max(8).default([]),
}).superRefine((source, context) => {
  if ((source.type === 'iframe') !== (source.delivery === 'embed')) context.addIssue({ code: 'custom', message: 'Frame sources require embed delivery.' })
  if (source.type === 'iframe' && !/^https:\/\//.test(source.src)) context.addIssue({ code: 'custom', message: 'Frame sources require HTTPS.' })
})
export const playbackSessionSchema = z.object({
  id: z.string().uuid(), ref: playbackRefSchema, source: playbackSourceSchema,
  expiresAt: z.iso.datetime(), fallbackCount: z.int().min(0).max(128),
  capabilities: z.object({ refresh: z.boolean(), fallback: z.boolean(), externalSubtitles: z.boolean() }),
})
export const playbackFailureRequestSchema = z.object({
  sourceId: z.string().min(1).max(160), reason: z.enum(['network', 'media', 'expired', 'unsupported']),
  deliveryFailure: deliveryFailureSchema.optional(),
  preferences: playbackPreferencesSchema.optional(),
})
export const playbackEventsSchema = z.object({ events: z.array(z.object({
  type: z.enum(['started', 'buffer-start', 'buffer-end', 'error', 'switched', 'ended', 'viewing']),
  position: z.number().min(0).max(86400), elapsedMs: z.number().min(0).max(86400000).optional(),
  delivery: playbackDeliverySchema.optional(),
  browser: z.enum(['chrome', 'edge', 'firefox', 'safari', 'other']).optional(),
})).min(1).max(20) })
/** Low-cardinality, anonymous browser performance measurements. Page values
 *  are route groups only; never send URLs, member identifiers, or referrers. */
export const webVitalMetricSchema = z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB'])
export const webVitalPageSchema = z.enum(['home', 'catalog', 'title', 'watch', 'embed', 'profile', 'member', 'auth', 'support', 'other'])
export const webVitalEventSchema = z.object({
  metric: webVitalMetricSchema,
  page: webVitalPageSchema,
  value: z.number().finite().nonnegative(),
}).strict().superRefine((event, context) => {
  const max = event.metric === 'CLS' ? 10 : 120_000
  if (event.value > max) context.addIssue({ code: 'custom', message: 'Measurement is outside the supported range.', path: ['value'] })
})
export const webVitalBatchSchema = z.object({ events: z.array(webVitalEventSchema).min(1).max(20) }).strict()
export type WebVitalEvent = z.infer<typeof webVitalEventSchema>
export type WebVitalBatch = z.infer<typeof webVitalBatchSchema>
export const playbackSwitchRequestSchema = z.object({ providerId: z.string().min(1).max(80), preferences: playbackPreferencesSchema.optional() })
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
  /** Every listed provider supplies browser-direct media. */
  deliveryMode: providerDeliveryModeSchema.default('direct'),
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
export const subtitlesResponseSchema = z.object({ subtitles: z.array(subtitleTrackSchema) })
/** Per-member subtitle sync correction for one title/episode. offsetMs
 *  shifts every cue server-side (`?offsetMs=`); trackId remembers the
 *  chosen track. One row per member/content; crowdsourced correction reads
 *  this table later without ever rewriting shared files. */
export const subtitlePreferenceSchema = z.object({
  ref: playbackRefSchema,
  trackId: z.string().min(1).max(128).nullable().default(null),
  offsetMs: z.int().min(-120000).max(120000).default(0),
})
export type SubtitlePreference = z.infer<typeof subtitlePreferenceSchema>
export const subtitlePreferenceResponseSchema = z.object({ preference: subtitlePreferenceSchema })
export type SubtitlePreferenceResponse = z.infer<typeof subtitlePreferenceResponseSchema>
export type SubtitlesResponse = z.infer<typeof subtitlesResponseSchema>
/** Bounded public subtitle discovery documents, shared across API and player. */
export const subtitleProviderStatusSchema = z.object({
  id: z.string().min(1).max(64), name: z.string().min(1).max(160),
  state: z.enum(['ready', 'skipped', 'no_match', 'failed', 'timeout']),
  durationMs: z.number().finite().nonnegative(), found: z.int().min(0).max(100000),
  reason: z.enum(['credentials_required', 'unsupported']).optional(),
  failure: z.enum(['search', 'parse', 'download', 'conversion']).optional(),
})
export const subtitleDiscoveryEventSchema = z.object({
  type: z.enum(['snapshot', 'provider', 'complete']), searchId: z.uuid(),
  languages: z.array(z.object({ code: z.string().regex(/^[a-z]{2,3}$/), count: z.int().min(0).max(100000) })).max(256),
  provider: subtitleProviderStatusSchema.optional(),
}).refine((event) => event.type !== 'provider' || Boolean(event.provider), 'Provider events require a provider result.')
export const subtitleCandidateSchema = z.object({
  id: z.string().min(1).max(128), label: z.string().max(160), language: z.string().regex(/^[a-z]{2,3}$/),
  provider: z.string().min(1).max(64), release: z.string().max(160).optional(),
  hi: z.boolean().optional(), forced: z.boolean().optional(), sdh: z.boolean().optional(), machineTranslated: z.boolean().optional(),
  preparedUrl: z.url().max(4096).refine((value) => /^https?:\/\/[^/?#@\\\s]+(?:[/?#]|$)/i.test(value)).optional(),
})
export const subtitleDiscoveryPageSchema = z.object({
  tracks: z.array(subtitleCandidateSchema).max(20), total: z.int().min(0).max(100000), nextCursor: z.int().min(0).max(100000).nullable(),
})
export type SubtitleCandidate = z.infer<typeof subtitleCandidateSchema>
export type SubtitleProviderStatus = z.infer<typeof subtitleProviderStatusSchema>
export type SubtitleDiscoveryEvent = z.infer<typeof subtitleDiscoveryEventSchema>
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
  completionId: z.uuid().optional(),
  durationSeconds: z.int().min(1).max(86400).optional(),
  positionSeconds: z.int().min(0).max(86400),
}).superRefine((input, context) => {
  if (input.completionId && (input.completed !== true || !playbackRefSchema.safeParse(input).success)) {
    context.addIssue({ code: 'custom', message: 'A completion needs an exact movie or episode reference.', path: ['completionId'] })
  }
})
export type ProgressWriteRequest = z.infer<typeof progressWriteRequestSchema>

export const watchHistoryEntrySchema = playbackRefSchema.and(z.object({
  entryId: z.string().min(1),
  completedAt: z.iso.datetime(),
}))
export type WatchHistoryEntry = z.infer<typeof watchHistoryEntrySchema>
export const watchHistoryPageSchema = z.object({
  items: z.array(watchHistoryEntrySchema),
  nextCursor: z.string().min(1).nullable(),
})
export type WatchHistoryPage = z.infer<typeof watchHistoryPageSchema>

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
  favorites: z.array(favoriteSchema).max(MAX_MEMBER_FAVORITES),
  lists: z.array(memberListSummarySchema),
  profile: profileSchema,
  reviews: z.array(memberReviewSchema),
  ratingDistribution: z.array(z.object({ count: z.int().nonnegative(), value: z.int().min(1).max(10) })).length(10).optional(),
  /** Compatibility with deployed web builds from before personal-only profiles.
   * Counts are stored data and remain behind the owner-only profile route. */
  social: z.object({ followers: z.int().nonnegative(), following: z.int().nonnegative() }).optional(),
  statistics: z.object({
    diaryEntries: z.int().nonnegative(),
    lists: z.int().nonnegative(),
    reviews: z.int().nonnegative(),
    watched: z.int().nonnegative(),
  }),
})
export type MemberProfileData = z.infer<typeof memberProfileDataSchema>

/** Owner-only archives keep the profile overview bounded. Watchlist remains in the personal Library. */
export const memberProfileArchiveKindSchema = z.enum(['activity', 'diary', 'films', 'likes', 'lists', 'reviews', 'tags'])
export type MemberProfileArchiveKind = z.infer<typeof memberProfileArchiveKindSchema>
export const memberProfileArchiveQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
})
export const memberProfileArchiveCursorSchema = z.object({
  collection: memberProfileArchiveKindSchema,
  createdAt: z.iso.datetime().optional(),
  id: z.string().min(1).max(128),
  kind: z.enum(['diary', 'review']).optional(),
  updatedAt: z.iso.datetime().optional(),
  watchedOn: z.iso.datetime().optional(),
})
export type MemberProfileArchiveCursor = z.infer<typeof memberProfileArchiveCursorSchema>
export const memberProfileTagSchema = z.object({ count: z.int().positive(), tag: z.string().min(1).max(100) })
export const memberProfileActivityEntrySchema = z.discriminatedUnion('kind', [
  z.object({ occurredAt: z.iso.datetime(), kind: z.literal('diary'), item: diaryEntrySchema }),
  z.object({ occurredAt: z.iso.datetime(), kind: z.literal('review'), item: memberReviewSchema }),
])
export const memberProfileArchivePageSchema = z.discriminatedUnion('collection', [
  z.object({ collection: z.literal('activity'), items: z.array(memberProfileActivityEntrySchema).max(50), nextCursor: z.string().max(512).nullable() }),
  z.object({ collection: z.literal('diary'), items: z.array(diaryEntrySchema).max(50), nextCursor: z.string().max(512).nullable() }),
  z.object({ collection: z.literal('films'), items: z.array(memberTitleRecordSchema).max(50), nextCursor: z.string().max(512).nullable() }),
  z.object({ collection: z.literal('likes'), items: z.array(memberTitleRecordSchema).max(50), nextCursor: z.string().max(512).nullable() }),
  z.object({ collection: z.literal('lists'), items: z.array(memberListSummarySchema).max(50), nextCursor: z.string().max(512).nullable() }),
  z.object({ collection: z.literal('reviews'), items: z.array(memberReviewSchema).max(50), nextCursor: z.string().max(512).nullable() }),
  z.object({ collection: z.literal('tags'), items: z.array(memberProfileTagSchema).max(100), nextCursor: z.null() }),
])
export type MemberProfileArchivePage = z.infer<typeof memberProfileArchivePageSchema>

export const memberListDetailSchema = z.object({
  items: z.array(memberTitleRecordSchema.extend({ note: z.string().nullable(), position: z.int().positive() })),
  list: memberListSummarySchema,
  owner: memberListOwnerSchema,
  
  viewerIsOwner: z.boolean(),
})
export type MemberListDetail = z.infer<typeof memberListDetailSchema>


export const memberExportSchema = z.object({
  exportedAt: z.iso.datetime(),
  library: memberLibrarySchema,
  watchHistory: z.array(watchHistoryEntrySchema),
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
/** Display label for a catalog kind: 'Movie' | 'Series' | 'Anime'. */
export function kindLabel(kind: CatalogKind) {
  if (kind === 'anime') return 'Anime'
  return kind === 'series' ? 'Series' : 'Movie'
}
export function reviewsHref(title: CatalogRef) {
  return `${titleHref(title)}/reviews`
}
export function watchHref(title: CatalogRef, episode?: { episode: number; season: number }) {
  if (title.kind === 'anime') return `/watch/anime/${title.id}?episode=${episode?.episode ?? 1}`
  if (title.kind === 'movie') return `/watch/movie/${title.id}`

  return `/watch/series/${title.id}?season=${episode?.season ?? 1}&episode=${episode?.episode ?? 1}`
}
export function diaryEntryHref(entry: DiaryRef) {
  if (entry.episode === undefined) return titleHref(entry)
  return watchHref(entry, { episode: entry.episode, season: entry.season ?? 1 })
}
