import type { ZodType } from 'zod'
import type { PlaybackRef, ProviderRole, ProviderDeliveryMode } from '@consumit/contracts'

export class AdminApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, options: { code: string; status: number }) {
    super(message)
    this.name = 'AdminApiError'
    this.code = options.code
    this.status = options.status
  }
}

async function request<T>(path: string, options: RequestInit, schema?: ZodType<T>): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers as Record<string, string> },
    })
  } catch (cause) {
    if (options.signal?.aborted) throw cause
    throw new AdminApiError('Network error. Check your connection.', { code: 'NETWORK', status: 0 })
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const envelope = typeof body === 'object' && body !== null && 'error' in body ? (body as { error: unknown }).error : body
    const message = typeof envelope === 'object' && envelope !== null && 'message' in envelope ? String((envelope as { message: unknown }).message) : response.statusText
    throw new AdminApiError(message, { code: typeof envelope === 'object' && envelope !== null && 'code' in envelope ? String((envelope as { code: unknown }).code) : 'UNKNOWN', status: response.status })
  }
  if (schema) return schema.parse(body)
  return body as T
}

// --- Providers ---

export type AdminProvider = {
  id: string
  role?: ProviderRole
  deliveryMode?: ProviderDeliveryMode
  proxyApproved?: boolean
  audioCapabilities?: { separateAudio: 'unverified'; languages: string[]; health: 'untested' }
  removed?: boolean
  configuredRegions?: string[]
  enabled: boolean
  regions: string[]
  mediaHosts: string[]
  upstreamGroup: string
  concurrency: number
  requestsPerMinute: number
  priority: number
  mediaKinds: string[]
}

export type ProviderReadinessSummary = {
  removedRows?: number
  configuredRows: number
  enabledRows: number
}

export async function listProviders(signal?: AbortSignal): Promise<{ providers: AdminProvider[]; readiness: ProviderReadinessSummary }> {
  return request('/v1/admin/providers', { method: 'GET', ...(signal ? { signal } : {}) })
}

export type ProviderKind = 'movie' | 'series' | 'anime'
export type ProviderOrder = { kind: ProviderKind; providerIds: string[]; revision: number }
export async function getProviderOrder(kind: ProviderKind): Promise<ProviderOrder> {
  return request(`/v1/admin/providers/order/${kind}`, { method: 'GET' })
}
export async function saveProviderOrder(kind: ProviderKind, providerIds: string[], revision: number): Promise<ProviderOrder> {
  return request(`/v1/admin/providers/order/${kind}`, { method: 'PUT', body: JSON.stringify({ providerIds, revision }) })
}

export type ProviderTestResult = {
  providerId: string
  ok: boolean
  sourceCount?: number
  sources?: Array<{ key: string; type: string; language: string; qualityHint?: string }>
  code?: string
  retryable?: boolean
  error?: string
}

export type ProviderHealthRow = {
  id: string
  region: string
  enabled: boolean
  status: 'healthy' | 'degraded' | 'down' | 'unknown' | 'disabled'
  probe: { ok: boolean; ms: number; at: number; code?: string } | null
  circuit: { failures: number; playbackFailures: number; openUntil: number; outcomes: number; success: number; latencyMs: number } | null
}

export async function listProviderHealth(signal?: AbortSignal): Promise<Record<'movie' | 'series' | 'anime', ProviderHealthRow[]>> {
  return request('/v1/admin/providers/health', { method: 'GET', ...(signal ? { signal } : {}) })
}

export type ProviderMetrics = { starts: number; playbackFailures: number; buffers: number; directSelections: number; resolveSuccess: number; resolveFailures: number; startupP50Ms?: number; startupP95Ms?: number; startupP99Ms?: number; stallP50Ms?: number; stallP95Ms?: number; stallP99Ms?: number }
export async function listProviderMetrics(signal?: AbortSignal): Promise<{ available: boolean; windowMinutes: number; metrics: Record<string, ProviderMetrics> }> {
  return request('/v1/admin/providers/metrics', { method: 'GET', ...(signal ? { signal } : {}) })
}

export type ProviderAlert = { name: string; severity: string; state: string; provider?: string; kind?: string; region?: string; since: string }
export async function listProviderAlerts(signal?: AbortSignal): Promise<{ available: boolean; alerts: ProviderAlert[] }> {
  return request('/v1/admin/providers/alerts', { method: 'GET', ...(signal ? { signal } : {}) })
}

export type SubtitleProviderDiagnostic = { id: string; name: string; configured: boolean; requirement: string | null; last: { state: 'ready' | 'skipped' | 'no_match' | 'failed' | 'timeout'; durationMs: number; found: number; failure?: string } | null }
export async function listSubtitleDiagnostics(): Promise<{ providers: SubtitleProviderDiagnostic[] }> {
  return request('/v1/admin/subtitles', { method: 'GET' })
}
export async function testSubtitleTitle(ref: PlaybackRef): Promise<{ providers: SubtitleProviderDiagnostic[]; languages: number; tracks: number }> {
  return request('/v1/admin/subtitles/test', { method: 'POST', body: JSON.stringify(ref) })
}

export async function retestProvider(providerId: string, kind: 'movie' | 'series' | 'anime', region: string): Promise<void> {
  await request(`/v1/admin/providers/${encodeURIComponent(providerId)}/retest`, { method: 'POST', body: JSON.stringify({ kind, region }) })
}

export async function resetProviderCircuit(providerId: string, kind: 'movie' | 'series' | 'anime'): Promise<void> {
  await request(`/v1/admin/providers/${encodeURIComponent(providerId)}/circuit/reset`, { method: 'POST', body: JSON.stringify({ kind }) })
}

export async function testProvider(providerId: string, ref: PlaybackRef, audioLanguage?: string, signal?: AbortSignal): Promise<ProviderTestResult> {
  return request('/v1/admin/providers/test', { method: 'POST', body: JSON.stringify({ providerId, ref, audioLanguage }), ...(signal ? { signal } : {}) })
}

// --- Provider config overrides ---

export type ProviderOverridePatch = {
  deliveryMode?: ProviderDeliveryMode
  removed?: boolean
  enabled?: boolean
  role?: ProviderRole
  priority?: number
  order?: Partial<Record<ProviderKind, number>>
  regions?: string[]
  requestsPerMinute?: number
  concurrency?: number
}

export async function getProviderConfig(): Promise<{ overrides: Record<string, ProviderOverridePatch> }> {
  return request('/v1/admin/providers/config', { method: 'GET' })
}

export type ProviderChange = { providerId: string; actorId: string; before: ProviderOverridePatch | null; after: ProviderOverridePatch | null; createdAt: string }
export async function listProviderChanges(signal?: AbortSignal): Promise<{ changes: ProviderChange[] }> {
  return request('/v1/admin/providers/changes', { method: 'GET', ...(signal ? { signal } : {}) })
}

export async function updateProviderConfig(providerId: string, patch: ProviderOverridePatch): Promise<{ id: string }> {
  return request(`/v1/admin/providers/${encodeURIComponent(providerId)}/config`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export async function resetProviderConfig(providerId: string): Promise<void> {
  return request(`/v1/admin/providers/${encodeURIComponent(providerId)}/config`, { method: 'DELETE' })
}

// --- Members ---

export type AdminMember = {
  id: string
  email: string
  username: string
  displayName: string | null
  role: 'admin' | 'member'
  createdAt: string
  emailVerified: boolean
}

export async function listMembers(limit = 50, offset = 0): Promise<{ members: AdminMember[]; total: number; limit: number; offset: number }> {
  return request(`/v1/admin/members?limit=${limit}&offset=${offset}`, { method: 'GET' })
}

export async function setMemberRole(memberId: string, role: 'admin' | 'member'): Promise<{ id: string; role: string }> {
  return request(`/v1/admin/members/${encodeURIComponent(memberId)}/role`, { method: 'POST', body: JSON.stringify({ role }) })
}

// --- Health ---

export type HealthResult = {
  api: 'ok'
  store: 'ok' | 'error'
}

export async function deleteProvider(providerId: string): Promise<void> {
  await request(`/v1/admin/providers/${encodeURIComponent(providerId)}`, { method: 'DELETE' })
}

export async function restoreProvider(providerId: string): Promise<void> {
  await request(`/v1/admin/providers/${encodeURIComponent(providerId)}/restore`, { method: 'POST' })
}

export async function checkHealth(signal?: AbortSignal): Promise<HealthResult> {
  return request('/v1/admin/health', { method: 'GET', ...(signal ? { signal } : {}) })
}

export type ScoutCandidate = { id: string; mediaKinds: ProviderKind[]; regions: string[]; mediaHosts: string[]; upstreamGroup: string; configured: boolean; separateAudio: boolean }
export type ProviderInspection = { providerId: string; ok: boolean; code: string; elapsedMs: number; region: string; rejectedSources: number;
  delivery?: 'direct' | 'relay' | 'embed';
  sources: { key: string; type: string; language: string; host: string; qualityHint?: string; subtitleCount: number }[];
  preview?: { src: string; type: 'hls' | 'dash' | 'native' | 'iframe'; qualityHint?: string; expiresAt: string; delivery?: 'direct' | 'relay' | 'embed' } }
export async function listScoutCandidates(signal?: AbortSignal): Promise<{ candidates: ScoutCandidate[] }> {
  return request('/v1/admin/providers/scout', { method: 'GET', ...(signal ? { signal } : {}) })
}
export async function inspectProvider(providerId: string, ref: PlaybackRef, audioLanguage: string, scope: 'configured' | 'scout', signal: AbortSignal): Promise<ProviderInspection> {
  return request('/v1/admin/providers/inspect', { method: 'POST', body: JSON.stringify({ providerId, ref, audioLanguage, scope }), signal })
}
export async function getScoutRecipe(id: string): Promise<{ recipe: Record<string, unknown> }> {
  return request(`/v1/admin/providers/scout/${encodeURIComponent(id)}/recipe`, { method: 'GET', signal: AbortSignal.timeout(10000) })
}
