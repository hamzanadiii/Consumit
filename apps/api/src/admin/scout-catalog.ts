import example from '../../../../infra/playback/providers.example.json'
import { configuredProviders } from '../playback/configured-providers.ts'

// Finite, reviewed recipes. This is a test bench, never the live resolver roster.
// Hosts come from the shipped adapters and PROVE's direct-chain allowlist.
const additions = [
  { id: 'nhdapi', adapter: 'nhdapi', mediaHosts: ['nhdapi.streamfinder.st'], resolutionHosts: ['player.nhdapi.com'], upstreamGroup: 'nhdapi' },
  { id: 'stellar', adapter: 'stellar', mediaHosts: ['totallyacdn.org', '*.totallyacdn.org'], resolutionHosts: ['api.stellar.gdn', 'stellar.gdn'], upstreamGroup: 'stellar' },
  { id: 'vidlux', adapter: 'vidlux', mediaHosts: ['stream.afrilix.com', 'vixsrc.to', '*.vix-content.net'], resolutionHosts: [], upstreamGroup: 'vidlux' },
].map((row) => ({ ...row, enabled: false, regions: ['US'], mediaKinds: ['movie', 'series'], concurrency: 1, requestsPerMinute: 10, attemptMs: 15000 }))

export const scoutRecipes = [...example, ...additions].map((row) => ({ ...row, upstreamGroup: row.upstreamGroup ?? row.adapter, enabled: false }))

export function createScoutCatalog(options: Parameters<typeof configuredProviders>[1]) {
  let catalog: ReturnType<typeof configuredProviders> | undefined
  return () => catalog ??= configuredProviders(scoutRecipes, options)
}
