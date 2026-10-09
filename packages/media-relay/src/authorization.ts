/** Shared cookie names and proof validation for API and edge. */
export type RelayScope = { owner: string; session: string; audience: 'browser' | 'cast' }
export function playbackCookieName(secure: boolean, audience: RelayScope['audience'] = 'browser') {
  return `${secure ? '__Host-' : ''}consumit-${audience === 'cast' ? 'cast' : 'playback'}`
}
export async function playbackOwner(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export async function cookieOwnsGrant(cookie: string | null, scope: RelayScope, secure: boolean): Promise<boolean> {
  const name = playbackCookieName(secure, scope.audience)
  const matches = (cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`))
  if (matches.length !== 1) return false
  const token = matches[0]!.slice(name.length + 1)
  return /^[a-f0-9]{64}$/.test(token) && await playbackOwner(token) === scope.owner
}
