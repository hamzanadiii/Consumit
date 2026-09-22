import type { MemberData } from './member-data.ts'

export const unavailableMemberData: MemberData = {
  createDiaryEntry: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  createReview: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  isFollowing: async () => false,
  library: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  like: async () => null,
  list: async () => null,
  profile: async () => null,
  progress: async () => null,
  rating: async () => null,
  removeLike: async () => false,
  removeRating: async () => false,
  removeReviewLike: async () => false,
  review: async () => null,
  setFavorites: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  setFollow: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setLiked: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setProgress: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setRating: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setReviewLiked: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setSaved: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  setWatched: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  titleReviews: async (_ref, page) => ({ items: [], page, totalPages: 0, totalResults: 0 }),
  updateDiary: async () => false,
  updateList: async () => false,
  updateReview: async () => false,
}
