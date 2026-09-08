import type { MemberData } from './member-data.ts'

export const unavailableMemberData: MemberData = {
  library: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  list: async () => null,
  profile: async () => null,
  progress: async () => null,
  setFavorites: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  setProgress: async () => {
    throw new Error('MEMBER_DATA_UNAVAILABLE')
  },
  setSaved: async () => ({ diary: [], favorites: [], lists: [], saved: [], watched: [] }),
  updateDiary: async () => false,
  updateList: async () => false,
  updateReview: async () => false,
}
