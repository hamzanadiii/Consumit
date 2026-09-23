export const detailsQuery = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
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
    tags { name rank }
    coverImage { large color }
    bannerImage
    averageScore
    popularity
    description(asHtml: false)
    nextAiringEpisode { episode airingAt }
    source
    countryOfOrigin
    trailer { id site thumbnail }
    characters(sort: ROLE, perPage: 25) {
      edges {
        node { id name { full } image { large } }
        voiceActors(language: JAPANESE, sort: RELEVANCE) { id name { full } image { large } language }
      }
    }
    staff(sort: RELEVANCE, perPage: 10) {
      edges { node { id name { full } image { large } } role }
    }
    streamingEpisodes { title thumbnail site }
    externalLinks { id site url color }
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
