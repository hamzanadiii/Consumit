export const trendingQuery = `query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(sort: TRENDING_DESC, type: ANIME, status: RELEASING, isAdult: false) {
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
