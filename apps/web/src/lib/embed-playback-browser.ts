import { apiErrorResponseSchema, playbackProviderListSchema, playbackSessionSchema, type PlaybackFailureRequest, type PlaybackProvider, type PlaybackSession, type ResolvePlaybackRequest } from '@consumit/contracts'

async function responseJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null)
  if (response.ok) return body
  const parsed = apiErrorResponseSchema.safeParse(body)
  throw new Error(parsed.success ? parsed.data.error.message : 'Playback is temporarily unavailable. Try again.')
}

async function post(path: string, body: unknown, signal: AbortSignal, token?: string): Promise<unknown> {
  const response = await fetch(`/v1/embed/session${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    // 21s keeps the browser abort behind the resolver's shared 20s deadline
    // so slow direct chains resolve server-side instead of dying client-side.
    signal: AbortSignal.any([signal, AbortSignal.timeout(21_000)]),
    cache: 'no-store',
  })
  return responseJson(response)
}

export async function resolveEmbedSession(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<{ session: PlaybackSession; token: string }> {
  const body = await post('', input, signal)
  if (!body || typeof body !== 'object' || !('token' in body) || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token) || !('session' in body)) throw new Error('Playback returned an invalid session.')
  const session = playbackSessionSchema.safeParse(body.session)
  if (!session.success) throw new Error('Playback returned an invalid source.')
  return { session: session.data, token: body.token }
}

export async function listEmbedProviders(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackProvider[]> {
  const parsed = playbackProviderListSchema.safeParse(await post('/providers', input, signal))
  if (!parsed.success) throw new Error('Server list is unavailable right now.')
  return parsed.data.providers
}

export async function recoverEmbedSession(session: PlaybackSession, token: string, action: 'refresh' | 'fallback', failure: PlaybackFailureRequest, signal: AbortSignal): Promise<PlaybackSession> {
  const parsed = playbackSessionSchema.safeParse(await post(`/${session.id}/${action}`, failure, signal, token))
  if (!parsed.success) throw new Error('Playback returned an invalid source.')
  return parsed.data
}

export async function switchEmbedSession(session: PlaybackSession, token: string, providerId: string, signal: AbortSignal): Promise<PlaybackSession> {
  const parsed = playbackSessionSchema.safeParse(await post(`/${session.id}/switch`, { providerId }, signal, token))
  if (!parsed.success) throw new Error('Playback returned an invalid source.')
  return parsed.data
}
