# AniList GraphQL API Research

> Sources: https://docs.anilist.co/, https://github.com/AniList/docs

## 1. API Overview

- **Endpoint:** `POST https://graphql.anilist.co`
- **Protocol:** GraphQL (single endpoint, no REST)
- **Auth:** Public API for reads. OAuth2 (Bearer token) only for mutations/private data
- **Schema explorer:** https://studio.apollographql.com/sandbox/explorer?endpoint=https%3A%2F%2Fgraphql.anilist.co
- **Developer console:** https://anilist.co/settings/developer
- **Data volume:** 500k+ anime/manga entries, characters, staff, studios, airing data

## 2. Authentication

**No auth required for public data** — media search, details, trending, airing schedule, characters, staff, relations, genres, tags all work without a token.

Auth (OAuth2 Bearer token) is only needed for:
- User list read/write (SaveMediaListEntry, etc.)
- `mediaListEntry` field on Media (returns null if unauthenticated)
- Any mutations

```typescript
// Authenticated request
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
}
```

Token lifetime: 1 year. No refresh tokens — re-authenticate when expired.
Scopes: not supported. Tokens provide (almost) full access.

## 3. Rate Limiting

| Metric | Value |
|--------|-------|
| Normal limit | 90 requests/minute |
| **Current degraded limit** | **30 requests/minute** (temporary, as of 2026) |
| Burst limiter | Separate short-window throttling (undocumented) |
| Rate limit raise | Not currently accepted (email contact@anilist.co) |

**Response headers:**
```
X-RateLimit-Limit: 90
X-RateLimit-Remaining: 59
```

**On 429:**
```
Retry-After: 30          // seconds to wait
X-RateLimit-Reset: 1502035959  // unix timestamp
```

**On API outage:** HTTP 403 with `{"errors":[{"message":"The AniList API has been temporarily disabled...","status":403}]}`

**Best practices:**
- Use `X-RateLimit-Remaining` to proactively throttle
- Honor `Retry-After` on 429
- Batch queries where possible (GraphQL lets you fetch related data in one request)
- Use pagination (`perPage: 50` max on Page) to minimize calls
- Consider 2.1s minimum interval between requests when at 30/min

## 4. Pagination

Uses `Page` wrapper with `PageInfo`:

```typescript
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    media(type: ANIME) {
      id
      title { romaji }
    }
  }
}
```

- `perPage` max: 50 (Page), 25 (nested connections like characters/staff)
- Unprovided variables are silently ignored (no error)

## 5. Media Type — Key Fields

```typescript
// Core identification
id: Int!                    // AniList ID (unique per type)
idMal: Int                  // MyAnimeList ID
title: MediaTitle           // romaji, english, native, userPreferred
type: MediaType             // ANIME | MANGA
siteUrl: String             // https://anilist.co/anime/{id}

// Metadata
format: MediaFormat         // TV | TV_SHORT | MOVIE | SPECIAL | OVA | ONA | MUSIC
status: MediaStatus         // FINISHED | RELEASING | NOT_YET_RELEASED | CANCELLED | HIATUS
description: String         // Markdown (or HTML with asHtml: true)
source: MediaSource         // ORIGINAL | MANGA | LIGHT_NOVEL | VISUAL_NOVEL | VIDEO_GAME | OTHER | NOVEL | DOUJINSHI | MANHWA | MANHUA | WEB_NOVEL
countryOfOrigin: CountryCode // ISO 3166-1 alpha-2 (JP, KR, CN, etc.)
isLicensed: Boolean
isAdult: Boolean

// Dates & seasons
startDate: FuzzyDate        // { year, month, day } — any field can be null
endDate: FuzzyDate
season: MediaSeason         // WINTER | SPRING | SUMMER | FALL
seasonYear: Int
seasonInt: Int              // encoded year+season

// Episode data
episodes: Int               // total when complete
duration: Int               // minutes per episode
nextAiringEpisode: AiringSchedule  // next episode info
airingSchedule: AiringScheduleConnection  // full schedule (paginated, max 25)

// Ratings & popularity
averageScore: Int           // weighted average (0-100)
meanScore: Int              // mean of all user scores
popularity: Int             // number of users with this on list
trending: Int               // activity in past hour
favourites: Int

// Media
coverImage: MediaCoverImage // { extraLarge, large, medium, color }
bannerImage: String
trailer: MediaTrailer       // { id, site, thumbnail, url }
genres: [String]
synonyms: [String]
tags: [MediaTag]            // { id, name, description, category, rank, isGeneralSpoiler, isMediaSpoiler }

// Connections
relations: MediaConnection  // prequels, sequels, side stories, adaptations, etc.
characters: CharacterConnection  // paginated, has role field (MAIN | SUPPORTING | MINOR)
staff: StaffConnection      // paginated, has role field
studios: StudioConnection   // isMain flag
externalLinks: [MediaExternalLink]  // site, url, type, language, color, icon
streamingEpisodes: [MediaStreamingEpisode]  // title, thumbnail, url, site
rankings: [MediaRank]       // rank, type, year, season, allTime, format
stats: MediaStats           // score distribution, status distribution, etc.

// Auth-dependent
mediaListEntry: MediaList   // null if not authenticated
isFavourite: Boolean!       // requires auth
```

## 6. MediaTitle

```typescript
{
  romaji: String     // Japanese romanized title
  english: String    // English title (may be null)
  native: String     // Japanese native title
  userPreferred: String  // User's preferred language
}
```

## 7. MediaConnection (Relations)

```typescript
{
  edges: [{
    relationType: MediaRelation  // see enum below
    node: Media                  // the related media (id, title, format, etc.)
  }]
}
```

**MediaRelation enum:**
- `ADAPTATION` — adapted into a different format
- `PREQUEL` / `SEQUEL`
- `PARENT` — parent of a side story
- `SIDE_STORY`
- `CHARACTER` — shares characters
- `SUMMARY` — condensed version
- `ALTERNATIVE` — alternative version
- `SPIN_OFF`
- `SOURCE` (v2) — source material
- `COMPILATION` (v2)
- `CONTAINS` (v2)
- `SAME_UNIVERSE` (v3)
- `OTHER`

## 8. Character Connection

```typescript
// From Media.characters
{
  edges: [{
    node: Character {
      id: Int
      name: CharacterName { full, first, middle, last, native, alternative }
      image: CharacterImage { large, medium }
      description: String
      gender: String
      dateOfBirth: FuzzyDate
      age: String
      bloodType: String
      favourites: Int
      siteUrl: String
    }
    role: CharacterRole  // MAIN | SUPPORTING | MINOR
    voiceActors: [Staff] {  // filtered by language
      id
      name: StaffName { full, native }
      image: StaffImage { large, medium }
      primaryOccupations: [String]
      gender: String
      language: StaffLanguage
    }
    media: [Media] { id, title }  // context media
  }]
  pageInfo: { hasNextPage, total }
}
```

**Query characters by language (e.g., Japanese VA only):**
```graphql
characters(sort: [ROLE], perPage: 25) {
  edges {
    role
    node { name { full } }
    voiceActors(language: JAPANESE) {
      name { full }
    }
  }
}
```

## 9. Staff Connection

```typescript
// From Media.staff
{
  edges: [{
    node: Staff {
      id: Int
      name: StaffName { full, native }
      image: StaffImage { large, medium }
      primaryOccupations: [String]
      gender: String
      dateOfBirth: FuzzyDate
      dateOfDeath: FuzzyDate
      age: Int
      yearsActive: [Int]  // [startYear, endYear]
      homeTown: String
      bloodType: String
      favourites: Int
      siteUrl: String
      staffMedia: MediaConnection  // their works
      characters: CharacterConnection  // characters they voiced
    }
    role: String  // "Director", "Story & Script", etc.
  }]
  pageInfo: { hasNextPage, total }
}
```

## 10. AiringSchedule

```typescript
// On Media
nextAiringEpisode: {
  id: Int
  airingAt: Int          // unix timestamp
  timeUntilAiring: Int   // seconds
  episode: Int
  media: Media
}

airingSchedule(notYetAired: true, perPage: 25) {
  edges: [{
    node: {
      id: Int
      mediaId: Int
      airingAt: Int
      episode: Int
      timeUntilAiring: Int
      media: Media
    }
  }]
}
```

**Root query for global airing schedule:**
```graphql
query ($startTime: Int, $endTime: Int) {
  AiringSchedule(
    airingAt_lesser: $endTime
    airingAt_greater: $startTime
    notYetAired: true
    sort: TIME_ASC
  ) {
    edges {
      node {
        episode
        airingAt
        media {
          id
          title { romaji }
          coverImage { medium }
        }
      }
    }
  }
}
```

## 11. Trending Media

```typescript
// Root query
MediaTrend(
  date: Int                    // unix timestamp (day)
  mediaId: Int
  trending_greater: Int
  sort: [MediaTrendSort]       // TRENDING_DESC, SCORE_DESC, POPULARITY_DESC
  releasing: Boolean           // only while releasing
  page: Int
  perPage: Int                 // max 25
) {
  edges {
    node {
      mediaId: Int
      date: Int
      trending: Int
      averageScore: Int
      popularity: Int
      inProgress: Int
      releasing: Boolean
      episode: Int
      media: Media  // full media object
    }
  }
}
```

**MediaTrendSort:** `TRENDING_DESC | TRENDING_ASC | SCORE_DESC | SCORE_ASC | POPULARITY_DESC | POPULARITY_ASC | START_DATE_DESC | START_DATE_ASC`

## 12. Seasonal Anime

No dedicated "seasonal" query — use `Media` with season filters:

```graphql
query ($season: MediaSeason, $seasonYear: Int) {
  Page(page: 1, perPage: 50) {
    pageInfo { hasNextPage }
    media(
      type: ANIME
      season: $season
      seasonYear: $seasonYear
      sort: POPULARITY_DESC
    ) {
      id
      title { romaji, english }
      format
      status
      episodes
      season
      seasonYear
      coverImage { large }
      averageScore
      popularity
    }
  }
}
```

**MediaSeason enum:** `WINTER | SPRING | SUMMER | FALL`

**Note:** Winter includes December of the previous year.

## 13. External IDs — AniList ↔ MAL ↔ Others

### AniList ↔ MAL ID Mapping

```typescript
// On Media object
id: Int       // AniList ID
idMal: Int    // MyAnimeList ID (direct field on Media)
```

**Query by MAL ID:**
```graphql
query ($malId: Int) {
  Media(idMal: $malId, type: ANIME) {
    id
    idMal
    title { romaji }
  }
}
```

**Batch filter by MAL IDs:**
```graphql
query ($malIds: [Int]) {
  Page(perPage: 50) {
    media(idMal_in: $malIds, type: ANIME) {
      id
      idMal
      title { romaji }
    }
  }
}
```

### Other External Links

`Media.externalLinks` returns all external site links:

```typescript
[{
  id: Int!
  url: String
  site: String          // "MyAnimeList", "Crunchyroll", "Wikipedia", etc.
  siteId: Int
  type: ExternalLinkType  // INFO | STREAMING | SOCIAL | OFFICIAL | MERCH | OTHER
  language: String
  color: String
  icon: String          // 64x64 transparent PNG
  notes: String
  isDisabled: Boolean
}]
```

**ExternalLinkType enum:** `INFO | STREAMING | SOCIAL | OFFICIAL | MERCH | OTHER`

### Streaming Episodes

```typescript
[{
  title: String         // episode title
  thumbnail: String     // image URL
  url: String           // episode URL
  site: String          // "Crunchyroll", "Funimation", etc.
}]
```

## 14. Useful Enums Reference

### MediaFormat
`TV | TV_SHORT | MOVIE | SPECIAL | OVA | ONA | MUSIC`

### MediaStatus
`FINISHED | RELEASING | NOT_YET_RELEASED | CANCELLED | HIATUS`

### MediaSort
`ID | ID_DESC | TITLE | TITLE_DESC | POPULARITY | POPULARITY_DESC | TRENDING | TRENDING_DESC | START_DATE | START_DATE_DESC | END_DATE | END_DATE_DESC | SCORE | SCORE_DESC | FAVOURITES | FAVOURITES_DESC | TRENDING | TRENDING_DESC`

### CharacterRole
`MAIN | SUPPORTING | MINOR`

### StaffLanguage
`JAPANESE | ENGLISH | SPANISH | PORTUGUESE | FRENCH | GERMAN | ITALIAN | ARABIC | THAI | KOREAN | CHINESE | HINDI | POLISH | TURKISH | THAI | VIETNAMESE`

## 15. Sample Queries for Adapter Implementation

### Search Anime by Title
```graphql
query ($search: String!, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      hasNextPage
      currentPage
    }
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      idMal
      title { romaji, english, native, userPreferred }
      format
      status
      episodes
      season
      seasonYear
      coverImage { extraLarge, large, medium, color }
      averageScore
      popularity
    }
  }
}
```

### Get Full Media Details
```graphql
query ($id: Int!) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title { romaji, english, native, userPreferred }
    type
    format
    status
    description(asHtml: false)
    startDate { year, month, day }
    endDate { year, month, day }
    season
    seasonYear
    episodes
    duration
    countryOfOrigin
    isLicensed
    isAdult
    source
    coverImage { extraLarge, large, medium, color }
    bannerImage
    genres
    synonyms
    averageScore
    meanScore
    popularity
    trending
    favourites
    tags {
      id
      name
      description
      category
      rank
      isGeneralSpoiler
      isMediaSpoiler
    }
    relations {
      edges {
        relationType
        node {
          id
          title { romaji }
          format
          status
        }
      }
    }
    characters(sort: [ROLE], perPage: 25) {
      edges {
        role
        node {
          id
          name { full, native }
          image { large, medium }
        }
        voiceActors(language: JAPANESE) {
          id
          name { full, native }
          image { large, medium }
        }
      }
    }
    staff(perPage: 25) {
      edges {
        role
        node {
          id
          name { full, native }
          image { large, medium }
          primaryOccupations
        }
      }
    }
    studios(isMain: true) {
      edges {
        isMain
        node {
          id
          name
          isAnimationStudio
        }
      }
    }
    externalLinks {
      id
      url
      site
      type
      language
      color
      icon
    }
    streamingEpisodes {
      title
      thumbnail
      url
      site
    }
    rankings {
      rank
      type
      year
      season
      allTime
      format
    }
    nextAiringEpisode {
      airingAt
      timeUntilAiring
      episode
    }
    siteUrl
  }
}
```

### Get Trending Anime
```graphql
query ($date: Int) {
  MediaTrend(date: $date, sort: TRENDING_DESC, releasing: true) {
    edges {
      node {
        trending
        averageScore
        popularity
        episode
        media {
          id
          title { romaji }
          coverImage { medium }
          format
          status
        }
      }
    }
  }
}
```

### Get Airing Schedule (Next 7 Days)
```graphql
query ($startTime: Int!, $endTime: Int!) {
  Page(perPage: 50) {
    pageInfo { hasNextPage }
    mediaTrend(
      date_greater: $startTime
      date_lesser: $endTime
      releasing: true
      sort: TRENDING_DESC
    ) {
      trending
      episode
      media {
        id
        title { romaji }
        coverImage { medium }
      }
    }
  }
}
```

### Seasonal Anime (e.g., Fall 2026)
```graphql
query {
  Page(page: 1, perPage: 50) {
    pageInfo { hasNextPage }
    media(
      type: ANIME
      season: FALL
      seasonYear: 2026
      sort: POPULARITY_DESC
    ) {
      id
      title { romaji, english }
      format
      episodes
      status
      coverImage { large }
      averageScore
      popularity
      season
      seasonYear
    }
  }
}
```

### Lookup by MAL ID
```graphql
query ($malId: Int!) {
  Media(idMal: $malId, type: ANIME) {
    id
    idMal
    title { romaji, english }
    format
    status
    episodes
  }
}
```

## 16. Implementation Notes for Adapter

1. **Single endpoint:** All requests go to `POST https://graphql.anilist.co` with `{ query, variables }` body.

2. **No API key needed** for catalog operations. Only Bearer token for user-specific features.

3. **Rate limit strategy:**
   - Default to 30 req/min (degraded state)
   - Use `X-RateLimit-Remaining` header to proactively slow down
   - Implement exponential backoff on 429, honoring `Retry-After`
   - Batch: use `id_in` or `idMal_in` filters (up to 10,000 items) for bulk lookups
   - Use large `perPage` values (50 for Page, 25 for nested) to minimize calls

4. **ID mapping:**
   - `Media.id` = AniList ID (primary key)
   - `Media.idMal` = MAL ID (direct field, no extra query needed)
   - `Media.externalLinks` contains links to other services (Crunchyroll, MAL, etc.)
   - Can query directly by `idMal` filter

5. **Error handling:**
   - 200 + errors array = GraphQL errors (check `errors` field)
   - 403 = API outage (not client error)
   - 429 = rate limited
   - 404 = media not found or type mismatch

6. **FuzzyDate format:** `{ year: Int, month: Int, day: Int }` — any field nullable. For filters, use `FuzzyDateInt` (YYYYMMDD format, e.g., `20260901`).

7. **Connection pattern:** All nested lists use `{ edges: [{ node, role/relationType }], pageInfo }` pattern. Max perPage is 25 for nested connections.

8. **Description:** Returns Markdown by default. Use `description(asHtml: true)` for HTML.

9. **Streaming data:** `streamingEpisodes` is a flat array (not paginated), but may be incomplete. `externalLinks` with `type: STREAMING` is more comprehensive.
