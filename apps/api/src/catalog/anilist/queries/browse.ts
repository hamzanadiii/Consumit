export const browseQuery = `query ($page: Int, $perPage: Int, $sort: [MediaSort], $genre: String, $seasonYear: Int, $format: MediaFormat) {
  Page(page: $page, perPage: $perPage) {
    media(sort: $sort, type: ANIME, genre: $genre, seasonYear: $seasonYear, format: $format, isAdult: false) {
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
