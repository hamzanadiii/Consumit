import type { ZodType } from 'zod'

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
  } catch {
    throw new AdminApiError('Network error. Check your connection.', { code: 'NETWORK', status: 0 })
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body ? String((body as { message: unknown }).message) : response.statusText
    throw new AdminApiError(message, { code: typeof body === 'object' && body !== null && 'code' in body ? String((body as { code: unknown }).code) : 'UNKNOWN', status: response.status })
  }
  if (schema) return schema.parse(body)
  return body as T
}

// --- Domains ---

export async function listDomains(): Promise<{ domains: string[] }> {
  return request('/v1/admin/domains', { method: 'GET' })
}

export async function addDomain(domain: string): Promise<{ domain: string }> {
  return request('/v1/admin/domains', { method: 'POST', body: JSON.stringify({ domain }) })
}

export async function removeDomain(domain: string): Promise<void> {
  return request(`/v1/admin/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' })
}

// --- Providers ---

export type AdminProvider = {
  id: string
  enabled: boolean
  regions: string[]
  mediaHosts: string[]
  upstreamGroup: string
  concurrency: number
  requestsPerMinute: number
  priority: number
  proxy: boolean
  mediaKinds: string[]
}

export async function listProviders(): Promise<{ providers: AdminProvider[] }> {
  return request('/v1/admin/providers', { method: 'GET' })
}

export type ProviderTestResult = {
  providerId: string
  ok: boolean
  sourceCount?: number
  sources?: Array<{ key: string; type: string; url: string; language: string; qualityHint?: string }>
  code?: string
  retryable?: boolean
  error?: string
}

export async function testProvider(providerId: string, ref: { kind: 'movie' | 'series' | 'anime'; id: number; season?: number; episode?: number }, audioLanguage?: string): Promise<ProviderTestResult> {
  return request('/v1/admin/providers/test', { method: 'POST', body: JSON.stringify({ providerId, ref, audioLanguage }) })
}

// --- Provider config overrides ---

export type ProviderOverridePatch = {
  enabled?: boolean
  proxy?: boolean
  priority?: number
  regions?: string[]
  requestsPerMinute?: number
  concurrency?: number
}

export async function getProviderConfig(): Promise<{ overrides: Record<string, ProviderOverridePatch> }> {
  return request('/v1/admin/providers/config', { method: 'GET' })
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
  worker?: { status: 'ok' | 'error'; url: string; latencyMs?: number }
  store: 'ok' | 'error'
}

export async function checkHealth(): Promise<HealthResult> {
  return request('/v1/admin/health', { method: 'GET' })
}
