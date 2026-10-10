export const searchQuery = `query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
      id
      idMal
      isAdult
      title { romaji english native }
      format
      status
      season
      seasonYear
      episodes
      duration
      genres
      coverImage { extraLarge large color }
      bannerImage
      averageScore
      popularity
      description(asHtml: false)
      nextAiringEpisode { episode airingAt }
    }
    pageInfo { total lastPage hasNextPage }
  }
}`
