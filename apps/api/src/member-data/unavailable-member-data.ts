import type { MemberData } from './member-data.ts'

export const unavailableMemberData: MemberData = {
  createDiaryEntry: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  createReview: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  library: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  like: async () => null,
  list: async () => null,
  profile: async () => null,
  progress: async () => null,
  rating: async () => null,
  removeLike: async () => false,
  removeRating: async () => false,
  setFavorites: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  setLiked: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setProgress: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setRating: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setSaved: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  setWatched: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  updateDiary: async () => false,
  updateList: async () => false,
  updateReview: async () => false,
}
