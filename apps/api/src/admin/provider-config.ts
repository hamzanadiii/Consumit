import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { type ProviderRegistration } from '@consumit/provider-sdk'

export type ProviderKind = 'movie' | 'series' | 'anime'
export const providerKinds: readonly ProviderKind[] = ['movie', 'series', 'anime']

export type ProviderOverridePatch = {
  removed?: boolean
  enabled?: boolean
  priority?: number
  order?: Partial<Record<ProviderKind, number>>
  regions?: string[]
  requestsPerMinute?: number
  concurrency?: number
}
export type ProviderOverrides = Record<string, ProviderOverridePatch>
export type ProviderChangeRecord = { providerId: string; actorId: string; before: ProviderOverridePatch | null; after: ProviderOverridePatch | null; createdAt: string }
export interface ProviderConfigStore {
  getOverride(id: string): Promise<ProviderOverridePatch | undefined>
  getAll(): Promise<ProviderOverrides>
  setOverride(id: string, patch: ProviderOverridePatch, actorId?: string): Promise<void>
  removeOverride(id: string, actorId?: string): Promise<void>
  getRevision?(): Promise<number>
  listChanges?(limit: number): Promise<ProviderChangeRecord[]>
  setOrder?(kind: ProviderKind, ids: readonly string[], revision: number, actorId: string): Promise<boolean>
}

/** Drop obsolete settings while preserving operator choices and tombstones. */
export function cleanOverride(patch: ProviderOverridePatch): ProviderOverridePatch {
  const allowed = ['removed', 'enabled', 'priority', 'order', 'regions', 'requestsPerMinute', 'concurrency']
  return Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)))
}

const EMPTY: ProviderOverrides = {}

export function createProviderConfigStore(configPath: string) {
  let cache: ProviderOverrides | null = null
  let revision = 0
  let writes = Promise.resolve()

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = writes.then(operation)
    writes = task.then(() => undefined, () => undefined)
    return task
  }

  async function load(): Promise<ProviderOverrides> {
    if (cache) return cache
    try {
      const raw = await readFile(configPath, 'utf8')
      cache = Object.fromEntries(Object.entries(JSON.parse(raw) as ProviderOverrides).map(([id, patch]) => [id, cleanOverride(patch)]))
      return cache!
    } catch (cause) {
      if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT') {
        cache = { ...EMPTY }
        return cache
      }
      throw cause
    }
  }

  async function save(overrides: ProviderOverrides): Promise<void> {
    await mkdir(dirname(configPath), { recursive: true })
    const temporary = `${configPath}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(overrides, null, 2) + '\n', 'utf8')
    await rename(temporary, configPath)
    cache = overrides
    revision++
  }

  async function getOverride(id: string): Promise<ProviderOverridePatch | undefined> {
    const all = await load()
    return all[id]
  }

  async function getAll(): Promise<ProviderOverrides> {
    return load()
  }

  async function setOverride(id: string, patch: ProviderOverridePatch): Promise<void> {
    return serialize(async () => {
    const all = { ...await load() }
    all[id] = cleanOverride({ ...all[id], ...patch })
    // Remove entry if all fields are defaults (no overrides)
    const entry = all[id]
    if (entry && entry.removed === undefined && entry.enabled === undefined && entry.priority === undefined && entry.order === undefined
      && entry.regions === undefined && entry.requestsPerMinute === undefined && entry.concurrency === undefined) {
      delete all[id]
    }
    await save(all)
    })
  }

  async function removeOverride(id: string): Promise<void> {
    return serialize(async () => {
    const all = { ...await load() }
    if (all[id]?.order || all[id]?.removed) all[id] = { ...(all[id]?.order ? { order: all[id].order } : {}), ...(all[id]?.removed ? { removed: true } : {}) }
    else delete all[id]
    await save(all)
    })
  }

  async function setOrder(kind: ProviderKind, ids: readonly string[], expected: number): Promise<boolean> {
    return serialize(async () => {
    if (expected !== revision) return false
    const all = { ...await load() }
    ids.forEach((id, index) => { all[id] = { ...all[id], order: { ...all[id]?.order, [kind]: index } } })
    await save(all)
    return true
    })
  }

  return { getOverride, getAll, setOverride, removeOverride, getRevision: async () => revision, setOrder }
}

/** Saved order takes precedence; new providers append in configuration order. */
export function orderedProviderIds(providers: readonly ProviderRegistration[], overrides: ProviderOverrides, kind: ProviderKind): string[] {
  return providers.map((provider, index) => ({ provider, index }))
    .filter(({ provider }) => !overrides[provider.adapter.id]?.removed && !isProviderRemoved(provider) && provider.mediaKinds.includes(kind))
    .sort((a, b) => {
      const left = overrides[a.provider.adapter.id]?.order?.[kind]
      const right = overrides[b.provider.adapter.id]?.order?.[kind]
      if (left !== undefined || right !== undefined) return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER) || a.index - b.index
      return (b.provider.priority ?? 0) - (a.provider.priority ?? 0) || a.index - b.index
    }).map(({ provider }) => provider.adapter.id)
}

export function applyOrdersInPlace(target: Record<ProviderKind, string[]>, providers: readonly ProviderRegistration[], overrides: ProviderOverrides): void {
  for (const kind of providerKinds) target[kind] = orderedProviderIds(providers, overrides, kind)
}

/** Snapshot of a provider's original config before any overrides. */
type ProviderBase = {
  enabled: boolean
  priority: number
  regions: readonly string[]
  requestsPerMinute: number
  concurrency: number
}

const baseCache = new WeakMap<ProviderRegistration, ProviderBase>()
const removedProviders = new WeakSet<ProviderRegistration>()

export function isProviderRemoved(provider: ProviderRegistration): boolean {
  return removedProviders.has(provider)
}

export function configuredProviderRegions(provider: ProviderRegistration): readonly string[] {
  return getBase(provider).regions
}

function getBase(p: ProviderRegistration): ProviderBase {
  let base = baseCache.get(p)
  if (!base) {
    base = {
      enabled: p.enabled,
      priority: p.priority ?? 0,
      regions: [...p.approvedRegions],
      requestsPerMinute: p.requestsPerMinute,
      concurrency: p.concurrency,
    }
    baseCache.set(p, base)
  }
  return base
}

/** Mutate the live provider objects in-place so the resolver sees changes
 *  immediately without requiring a restart or array replacement.
 *  When an override field is removed (undefined in patch), the base value
 *  from the original config is restored. */
export function applyOverridesInPlace(providers: readonly ProviderRegistration[], overrides: ProviderOverrides): void {
  for (const p of providers) {
    const patch = overrides[p.adapter.id]
    const base = getBase(p)
    if (patch?.removed) removedProviders.add(p)
    else removedProviders.delete(p)
    if (!patch) {
      // No override — restore all base values
      p.enabled = base.enabled
      p.priority = base.priority
      p.approvedRegions = [...base.regions]
      p.requestsPerMinute = base.requestsPerMinute
      p.concurrency = base.concurrency
      continue
    }
    p.enabled = !patch.removed && (patch.enabled ?? base.enabled)
    p.priority = patch.priority ?? base.priority
    if (patch.regions !== undefined) p.approvedRegions = patch.regions.filter((region) => base.regions.includes(region))
    else p.approvedRegions = [...base.regions]
    p.requestsPerMinute = patch.requestsPerMinute ?? base.requestsPerMinute
    p.concurrency = patch.concurrency ?? base.concurrency
  }
}
