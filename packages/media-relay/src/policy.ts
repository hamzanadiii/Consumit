import { exactMediaHost } from './grants.ts'
export type RelayDiscovery = Record<string, 'storm-boron-v1' | 'wecollege-city-v1'>
export function parseRelayDiscovery(raw: string): RelayDiscovery {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([id, recipe]) =>
    !(id === 'stormboron' && recipe === 'storm-boron-v1' || ['wecollege-miami', 'wecollege-boise'].includes(id) && recipe === 'wecollege-city-v1'))) throw new Error('Unknown relay discovery recipe.')
  return value as RelayDiscovery
}
export function parseRelayProviders(raw: string): Record<string, string[]> {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid relay providers.')
  const entries = Object.entries(value)
  if (entries.length > 64 || entries.some(([id, hosts]) => !/^[a-z0-9-]{1,40}$/.test(id)
      || !Array.isArray(hosts) || !hosts.length || hosts.length > 100 || hosts.some(host => typeof host !== 'string' || !exactMediaHost(host)))) throw new Error('Relay requires exact approved media hosts per provider.')
  return Object.fromEntries(entries)
}
