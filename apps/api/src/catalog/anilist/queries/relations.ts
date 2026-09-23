export const relationsQuery = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english }
    relations {
      edges {
        relationType
        node {
          ... on Media {
            id
            idMal
            isAdult
            title { romaji english native }
            format
            status
            season
            seasonYear
            episodes
            coverImage { large color }
            averageScore
            popularity
            description(asHtml: false)
          }
        }
      }
    }
  }
}`
