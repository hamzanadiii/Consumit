export const relationsQuery = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ...AnimeRelationSummary
    relations {
      edges {
        relationType
        node {
          ... on Media {
            ...AnimeRelationSummary
          }
        }
      }
    }
  }
}
fragment AnimeRelationSummary on Media {
  id
  idMal
  type
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
}`
