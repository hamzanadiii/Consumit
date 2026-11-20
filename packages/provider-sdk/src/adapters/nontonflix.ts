import type { ProviderHttp } from './http.ts'
import { adapter, ProviderFailure } from './http.ts'

const origin = 'https://nontonflix.com'

/**
 * NontonFlix is a reachability-only Scout candidate until it has a
 * provider-approved lookup and media-delivery contract. The PROVE flow
 * depends on Cloudflare challenge cookies and device-bound media cookies,
 * which Consumit's current source and Relay contracts intentionally do not
 * forward. This adapter uses ordinary server HTTP and never turns a page
 * response into a playable source.
 */
export function createNontonflixProvider(http: ProviderHttp) {
  return adapter('nontonflix', async ({ ref }, signal) => {
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')

    const response = await http(`${origin}/`, { accept: 'text/html' }, signal)
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')

    // Reachable HTML is not playback evidence. A source must have a supported
    // session and media route before this candidate can return any sources.
    throw new ProviderFailure('unavailable')
  })
}
