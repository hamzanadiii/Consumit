import { afterEach, expect, it, vi } from 'vitest'
import { saveMemberFavorites } from './identity-browser'
afterEach(() => { window.history.replaceState({}, '', '/'); vi.unstubAllGlobals() })
it('rejects sample-profile writes before fetching, even with a real session cookie', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  window.history.replaceState({}, '', '/design-lab?surface=settings')
  await expect(saveMemberFavorites([])).rejects.toMatchObject({ code: 'SAMPLE_PROFILE_READ_ONLY', status: 403 })
  expect(fetch).not.toHaveBeenCalled()
})
it('retains the normal frontend favorite-save request', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch)
  window.history.replaceState({}, '', '/profile/alex')
  await saveMemberFavorites([])
  expect(fetch).toHaveBeenCalledWith('/v1/me/favorites', expect.objectContaining({ method: 'PUT', credentials: 'same-origin' }))
})
