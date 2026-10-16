import type { MemberData } from './member-data.ts'

export const unavailableMemberData: MemberData = {
  createDiaryEntry: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  deleteDiary: async () => false,
  createReview: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  libraryPage: async (memberId, collection) => ({ collection, items: [], nextCursor: null }),
  librarySnapshot: async () => ({ diary: { items: [], nextCursor: null }, favorites: [], lists: { items: [], nextCursor: null }, saved: { items: [], nextCursor: null } }),
  like: async () => null,
  list: async () => null,
  createList: async () => { throw new Error('MEMBER_DATA_UNAVAILABLE') },
  updateListContent: async () => false,
  deleteList: async () => false,
  profile: async () => null,
  profileArchive: async () => null,
  progress: async () => null,
  watchHistory: async () => { throw new Error('MEMBER_DATA_UNAVAILABLE') },
  rating: async () => null,
  ratingsByValue: async () => { throw new Error('MEMBER_DATA_UNAVAILABLE') },
  ratingsForTitles: async () => { throw new Error('MEMBER_DATA_UNAVAILABLE') },
  removeLike: async () => false,
  removeRating: async () => false,
  review: async () => null,
  setFavorites: async () => {},
  setLiked: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setProgress: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setRating: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setSaved: async () => {},
  setWatched: async () => {},
  titleState: async () => ({ like: null, rating: null, review: null, saved: false, watched: false }),
  titleReviews: async (_ref, page) => ({ items: [], page, totalPages: 0, totalResults: 0 }),
  updateDiary: async () => false,
  updateList: async () => false,
  updateReview: async () => false,
}
