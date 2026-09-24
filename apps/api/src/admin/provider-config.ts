import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ProviderRegistration } from '@consumit/provider-sdk'

export type ProviderOverridePatch = {
  enabled?: boolean
  proxy?: boolean
  priority?: number
  regions?: string[]
  requestsPerMinute?: number
  concurrency?: number
}
export type ProviderOverrides = Record<string, ProviderOverridePatch>

const EMPTY: ProviderOverrides = {}

export function createProviderConfigStore(configPath: string) {
  let cache: ProviderOverrides | null = null

  async function load(): Promise<ProviderOverrides> {
    if (cache) return cache
    try {
      const raw = await readFile(configPath, 'utf8')
      cache = JSON.parse(raw) as ProviderOverrides
      return cache!
    } catch {
      cache = EMPTY
      return cache
    }
  }

  async function save(overrides: ProviderOverrides): Promise<void> {
    cache = overrides
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8')
  }

  async function getOverride(id: string): Promise<ProviderOverridePatch | undefined> {
    const all = await load()
    return all[id]
  }

  async function getAll(): Promise<ProviderOverrides> {
    return load()
  }

  async function setOverride(id: string, patch: ProviderOverridePatch): Promise<void> {
    const all = await load()
    all[id] = { ...all[id], ...patch }
    // Remove entry if all fields are defaults (no overrides)
    const entry = all[id]
    if (entry && entry.enabled === undefined && entry.proxy === undefined && entry.priority === undefined
      && entry.regions === undefined && entry.requestsPerMinute === undefined && entry.concurrency === undefined) {
      delete all[id]
    }
    await save(all)
  }

  async function removeOverride(id: string): Promise<void> {
    const all = await load()
    delete all[id]
    await save(all)
  }

  return { getOverride, getAll, setOverride, removeOverride }
}

export type ProviderConfigStore = ReturnType<typeof createProviderConfigStore>

/** Snapshot of a provider's original config before any overrides. */
type ProviderBase = {
  enabled: boolean
  proxy: boolean
  priority: number
  regions: readonly string[]
  requestsPerMinute: number
  concurrency: number
}

const baseCache = new WeakMap<ProviderRegistration, ProviderBase>()

function getBase(p: ProviderRegistration): ProviderBase {
  let base = baseCache.get(p)
  if (!base) {
    base = {
      enabled: p.enabled,
      proxy: p.proxy,
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
    if (!patch) {
      // No override — restore all base values
      p.enabled = base.enabled
      p.proxy = base.proxy
      p.priority = base.priority
      p.approvedRegions = [...base.regions]
      p.requestsPerMinute = base.requestsPerMinute
      p.concurrency = base.concurrency
      continue
    }
    p.enabled = patch.enabled ?? base.enabled
    p.proxy = patch.proxy ?? base.proxy
    p.priority = patch.priority ?? base.priority
    if (patch.regions !== undefined) p.approvedRegions = patch.regions
    else p.approvedRegions = [...base.regions]
    p.requestsPerMinute = patch.requestsPerMinute ?? base.requestsPerMinute
    p.concurrency = patch.concurrency ?? base.concurrency
  }
}
