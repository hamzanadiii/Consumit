export const airingScheduleQuery = `query ($mediaId: Int, $page: Int, $perPage: Int) {
  AiringSchedule(page: $page, perPage: $perPage, mediaId: $mediaId, notYetAired: true) {
    nodes {
      episode
      airingAt
      timeUntilAiring
      media { id title { romaji english } }
    }
    pageInfo { total lastPage hasNextPage }
  }
}`
