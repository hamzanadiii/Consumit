import 'server-only'
import { tasteProfileSchema, tastePresentationSchema, type CatalogRef } from '@consumit/contracts'
import { memberRequest, getProfileRead, MemberApiError } from './member-server'
import { getCatalogBatchForRefs } from './catalog-api'

export async function loadTasteProfile(username: string, visitor = false) {
  const data = await getProfileRead(username, visitor)
  let unavailable = false
  const taste = await memberRequest(`/v1/taste/profiles/${encodeURIComponent(data.canonicalUsername)}${visitor ? '?visitor=true' : ''}`, tasteProfileSchema).catch(error => {
    if (error instanceof MemberApiError && error.status === 404) throw error
    unavailable = true
    return tasteProfileSchema.parse({ presentation: tastePresentationSchema.parse({}), revision: 0, owner: data.viewerIsOwner, editions: [], review: null, lists: [], comparison: null })
  })
  const refs: CatalogRef[] = [...data.favorites, ...taste.activity, ...(data.viewerIsOwner ? [...data.diary, ...data.reviews] : []), ...(taste.presentation.cover ? [taste.presentation.cover] : []), ...taste.lists.flatMap(l => l.refs), ...taste.editions.flatMap(e => [...e.data.picks, ...(e.data.cover ? [e.data.cover] : [])]), ...(taste.review ? [taste.review] : []), ...(taste.comparison ? [...taste.comparison.sharedFavorites, ...taste.comparison.sharedHighRatings, ...taste.comparison.differences] : [])]
  const titles = (await getCatalogBatchForRefs(refs).catch(() => null))?.items ?? []
  return { data, taste, titles, unavailable }
}
