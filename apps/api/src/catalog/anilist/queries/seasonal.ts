export const seasonalQuery = `query ($season: MediaSeason, $seasonYear: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
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
