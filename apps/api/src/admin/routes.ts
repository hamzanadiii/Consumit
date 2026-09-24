import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { ApiEnv } from '../config/env.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import type { Identity } from '../identity/identity.ts'
import type { IdentityRepository } from '../identity/repository.ts'
import { sessionCookieName } from '../identity/session.ts'
import type { ProbeStatus } from '../playback/probe.ts'
import type { PlaybackStore } from '../playback/state.ts'
import type { ProviderRegistration } from '@consumit/provider-sdk'
import type { ProviderConfigStore } from './provider-config.ts'
import { applyOverridesInPlace, type ProviderOverridePatch } from './provider-config.ts'

function parseBody<T extends Record<string, unknown>>(request: FastifyRequest, fields: (keyof T)[]): T {
  const body = request.body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') throw new ApiError('BAD_REQUEST', 'Request body required.')
  for (const field of fields) {
    if (body[field as string] === undefined) throw new ApiError('BAD_REQUEST', `Missing field: ${String(field)}.`)
  }
  return body as T
}

export function registerAdminRoutes(
  app: FastifyInstance,
  deps: { env: ApiEnv; identity: Identity; repository?: IdentityRepository | undefined; providers?: readonly ProviderRegistration[] | undefined; playbackStore?: PlaybackStore | undefined; providerConfig?: ProviderConfigStore | undefined; probeStatus?: (() => ProbeStatus) | undefined },
) {
  const { env, identity, repository, providers = [], playbackStore, providerConfig, probeStatus } = deps
  const cookieName = sessionCookieName(env)

  function guardMutation(request: FastifyRequest) {
    if (!isAllowedOrigin(request.headers, env.appOrigin, env.nodeEnv !== 'production')) {
      throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
    }
  }

  async function requireAdmin(request: FastifyRequest) {
    const token = request.cookies?.[cookieName]
    if (typeof token !== 'string' || token.length === 0) {
      throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    }
    const member = await identity.getSession(token)
    if (!member) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    if (member.role !== 'admin') throw new ApiError('FORBIDDEN', 'Admin access required.')
    return member
  }

  // --- Provider management ---

  app.get('/v1/admin/providers', async (request, reply) => {
    await requireAdmin(request)
    void reply.header('cache-control', 'private, no-store')
    return {
      providers: providers.map((p) => ({
        id: p.adapter.id,
        enabled: p.enabled,
        regions: [...p.approvedRegions],
        mediaHosts: [...p.mediaHosts],
        upstreamGroup: p.upstreamGroup,
        concurrency: p.concurrency,
        requestsPerMinute: p.requestsPerMinute,
        priority: p.priority ?? 0,
        proxy: p.proxy,
        mediaKinds: [...p.mediaKinds],
      })),
    }
  })

  app.get('/v1/admin/providers/health', async (request, reply) => {
    await requireAdmin(request)
    void reply.header('cache-control', 'private, no-store')
    // Synthetic probe truth, not resolver internals: the last scheduled
    // probe per provider (null when no cycle has finished yet).
    const probed = probeStatus?.() ?? {}
    const kinds = ['movie', 'series', 'anime'] as const
    const result: Record<string, Array<{ id: string; enabled: boolean; probe: ProbeStatus[string] | null }>> = {}
    for (const kind of kinds) {
      result[kind] = providers
        .filter((p) => p.mediaKinds.includes(kind))
        .map((p) => ({ id: p.adapter.id, enabled: p.enabled, probe: probed[p.adapter.id] ?? null }))
    }
    return result
  })

  app.post('/v1/admin/providers/test', async (request) => {
    guardMutation(request)
    await requireAdmin(request)
    const body = parseBody<{ providerId: string; ref: { kind: 'movie' | 'series' | 'anime'; id: number; season?: number; episode?: number }; audioLanguage?: string }>(request, ['providerId', 'ref'])
    const provider = providers.find((p) => p.adapter.id === body.providerId)
    if (!provider) throw new ApiError('BAD_REQUEST', `Provider "${body.providerId}" not found.`)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException('Test timed out', 'TimeoutError')), 15_000)
    try {
      const result = await provider.adapter.resolve({ ref: body.ref, region: env.tmdbRegion, audioLanguage: body.audioLanguage ?? 'en' }, controller.signal)
      return {
        providerId: body.providerId,
        ok: result.ok,
        ...(result.ok ? { sourceCount: result.sources.length, sources: result.sources.map((s) => ({ key: s.key, type: s.type, url: s.url.slice(0, 120) + (s.url.length > 120 ? '...' : ''), language: s.language, qualityHint: s.qualityHint })) } : { code: result.code, retryable: result.retryable }),
      }
    } catch (error) {
      return { providerId: body.providerId, ok: false, code: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
    } finally {
      clearTimeout(timeout)
    }
  })

  // --- Provider config (runtime overrides) ---

  if (providerConfig) {
    app.get('/v1/admin/providers/config', async (request, reply) => {
      await requireAdmin(request)
      void reply.header('cache-control', 'private, no-store')
      const overrides = await providerConfig.getAll()
      return { overrides }
    })

    app.patch('/v1/admin/providers/:id/config', async (request) => {
      guardMutation(request)
      await requireAdmin(request)
      const { id } = request.params as { id?: string }
      if (!id) throw new ApiError('BAD_REQUEST', 'Provider ID required.')
      const body = request.body as Record<string, unknown> ?? {}
      const patch: ProviderOverridePatch = {}
      if ('enabled' in body) {
        if (typeof body.enabled !== 'boolean') throw new ApiError('BAD_REQUEST', 'Enabled must be true or false.')
        patch.enabled = body.enabled
      }
      if ('proxy' in body) {
        if (typeof body.proxy !== 'boolean') throw new ApiError('BAD_REQUEST', 'Proxy must be true or false.')
        patch.proxy = body.proxy
      }
      if ('priority' in body) {
        const p = body.priority
        if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 100) throw new ApiError('BAD_REQUEST', 'Priority must be an integer from 0-100.')
        patch.priority = p
      }
      if ('regions' in body) {
        const r = body.regions
        if (!Array.isArray(r) || !r.every((v) => typeof v === 'string' && /^[A-Z]{2}$/.test(v))) {
          throw new ApiError('BAD_REQUEST', 'Regions must be an array of 2-letter uppercase codes.')
        }
        patch.regions = r
      }
      if ('requestsPerMinute' in body) {
        const rpm = body.requestsPerMinute
        if (typeof rpm !== 'number' || !Number.isInteger(rpm) || rpm < 1 || rpm > 120) throw new ApiError('BAD_REQUEST', 'RPM must be an integer from 1-120.')
        patch.requestsPerMinute = rpm
      }
      if ('concurrency' in body) {
        const c = body.concurrency
        if (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > 4) throw new ApiError('BAD_REQUEST', 'Concurrency must be an integer from 1-4.')
        patch.concurrency = c
      }
      if (Object.keys(patch).length === 0) throw new ApiError('BAD_REQUEST', 'Provide at least one field to update.')
      // Hot-apply from an explicit merged snapshot so the toggle takes
      // effect even when the file persist fails (e.g. read-only config
      // mount): only restart-survival is lost, never the live change.
      const current = await providerConfig.getAll()
      const merged = { ...current, [id]: { ...current[id], ...patch } }
      try { await providerConfig.setOverride(id, patch) }
      catch (error) { request.log.warn({ err: error }, 'provider override applied in memory but not persisted to disk') }
      applyOverridesInPlace(providers, merged)
      return { id, ...patch }
    })

    app.delete('/v1/admin/providers/:id/config', async (request, reply) => {
      guardMutation(request)
      await requireAdmin(request)
      const { id } = request.params as { id?: string }
      if (!id) throw new ApiError('BAD_REQUEST', 'Provider ID required.')
      const current = await providerConfig.getAll()
      const merged = { ...current }
      delete merged[id]
      try { await providerConfig.removeOverride(id) }
      catch (error) { request.log.warn({ err: error }, 'provider override removal applied in memory but not persisted to disk') }
      // Hot-apply: restore provider to base config
      applyOverridesInPlace(providers, merged)
      return reply.code(204).send()
    })
  }

  // --- Member management ---

  if (repository) {
    app.get('/v1/admin/members', async (request, reply) => {
      await requireAdmin(request)
      void reply.header('cache-control', 'private, no-store')
      const query = request.query as { limit?: string; offset?: string }
      const limit = Math.min(Math.max(parseInt(query.limit ?? '50', 10) || 50, 1), 200)
      const offset = Math.max(parseInt(query.offset ?? '0', 10) || 0, 0)
      const { members, total } = await repository.listAll(limit, offset)
      return {
        members: members.map((m) => ({
          id: m.id,
          email: m.email,
          username: m.profile.username,
          displayName: m.profile.displayName,
          role: m.role === 'ADMIN' ? 'admin' : 'member',
          createdAt: m.createdAt.toISOString(),
          emailVerified: m.emailVerifiedAt !== null,
        })),
        total,
        limit,
        offset,
      }
    })

    app.post('/v1/admin/members/:id/role', async (request) => {
      guardMutation(request)
      await requireAdmin(request)
      const { id } = request.params as { id?: string }
      if (!id) throw new ApiError('BAD_REQUEST', 'Member ID required.')
      const { role } = parseBody<{ role: string }>(request, ['role'])
      if (role !== 'admin' && role !== 'member') throw new ApiError('BAD_REQUEST', 'Role must be "admin" or "member".')
      const updated = await repository.setRole(id, role === 'admin' ? 'ADMIN' : 'MEMBER')
      if (!updated) throw new ApiError('NOT_FOUND', 'Member not found.')
      return { id: updated.id, role: updated.role === 'ADMIN' ? 'admin' : 'member' }
    })
  }

  // --- Worker health ---

  app.get('/v1/admin/health', async (request, reply) => {
    await requireAdmin(request)
    void reply.header('cache-control', 'private, no-store')
    const result: { api: 'ok'; worker?: { status: 'ok' | 'error'; url: string; latencyMs?: number }; store: 'ok' | 'error' } = { api: 'ok', store: 'ok' }
    if (env.workerUrl) {
      try {
        const start = Date.now()
        const res = await fetch(`${env.workerUrl.replace(/\/$/, '')}/health`, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
        result.worker = { status: res.ok ? 'ok' : 'error', url: env.workerUrl, latencyMs: Date.now() - start }
      } catch {
        result.worker = { status: 'error', url: env.workerUrl }
      }
    }
    if (playbackStore) {
      try {
        await playbackStore.set('_health_check', '1', 10)
        await playbackStore.get('_health_check')
      } catch {
        result.store = 'error'
      }
    }
    return result
  })
}
