import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { playbackRefSchema } from '@consumit/contracts'
import { createStaticProvider, createVixsrcProvider, createNhdapiProvider, createVaPlayerProvider, createVidcoreProvider, createInsertunitProvider, createMappleProvider, createStigstreamProvider, createWecollegeProvider, createPersesProvider, createRivestreamProvider, createVidapiProvider, createVidloveProvider, createScreenscapeProvider, createVidrockProvider, createVidnestProvider, createNetmirrorProvider, createVidstormProvider, createVidlinkProvider, createVidvaultProvider, createModiplayProvider, createCinehdProvider, createNxshaProvider, createStellarProvider, createAphroditeProvider, providerSourceSchema, type ProviderRegistration } from '@consumit/provider-sdk'
import { createProviderHttp } from './provider-http.ts'
import { createTmdbIdentityResolver } from './tmdb-identity.ts'
import { createTmdbMetadataResolver } from './tmdb-metadata.ts'
import type { MediaTransport } from './transport.ts'

const common = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  enabled: z.boolean().default(true),
  regions: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  mediaHosts: z.array(z.string().regex(/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/)).min(1).max(100),
  upstreamGroup: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
  concurrency: z.number().int().min(1).max(4).default(2),
  requestsPerMinute: z.number().int().min(1).max(120).default(30),
  priority: z.number().int().min(0).max(100).default(0),
})
const configurationSchema = z.array(z.union([
  common.extend({ adapter: z.literal('static').default('static'),
  entries: z.array(z.object({ ref: playbackRefSchema, sources: z.array(providerSourceSchema).max(32) })).max(1000),
  }),
  common.extend({ adapter: z.enum(['vixsrc', 'nhdapi', 'vaplayer', 'vidcore', 'insertunit', 'mapple', 'stigstream', 'wecollege', 'perses', 'rivestream', 'vidapi', 'vidlove', 'screenscape', 'vidrock', 'vidnest', 'netmirror', 'vidstorm', 'vidlink', 'vidvault', 'modiplay', 'cinehd', 'nxsha', 'stellar', 'aphrodite']),
    resolutionHosts: z.array(z.string().regex(/^[a-z0-9.-]+$/)).max(30).default([]),
    upstreamGroup: z.string().regex(/^[a-z0-9-]{1,60}$/),
  }),
])).max(30)

type ProviderOptions = { tmdbToken?: string | undefined; transport?: MediaTransport }

/** Explicit operator configuration for configured media; never imports the research registry. */
export async function loadConfiguredProviders(path?: string, options: ProviderOptions = {}): Promise<ProviderRegistration[]> {
  if (!path) return []
  const raw = await readFile(path, 'utf8')
  if (raw.length > 2_000_000) throw new Error('Playback media configuration exceeds its limit.')
  return configuredProviders(JSON.parse(raw), options)
}

export function configuredProviders(configuration: unknown, options: ProviderOptions = {}): ProviderRegistration[] {
  const parsed = configurationSchema.parse(configuration)
  if (new Set(parsed.map((entry) => entry.id)).size !== parsed.length) throw new Error('Duplicate playback provider id.')
  // No active-provider ceiling: per-provider concurrency, rate limits, hedged
  // resolution, and the three-candidate resolver window bound load instead.
  const active = parsed.filter((entry) => entry.enabled)
  return active.map((entry) => {
    if (entry.adapter !== 'static' && entry.id !== entry.adapter) throw new Error('Imported provider id must match its adapter.')
    const origins = { vixsrc: 'vixsrc.to', nhdapi: 'nhdapi.com', vaplayer: 'streamdata.vaplayer.ru', vidcore: 'vidrack.created.app', insertunit: 'api.insertunit.ws', mapple: 'mapple.rip', stigstream: 'api.stigstream.ru', wecollege: 'api.wecollege.net', perses: 'streamguide.cfd', rivestream: 'scrapper.rivestream.app', vidapi: 'streamdata.vaplayer.ru', vidlove: 'api.vidlove.cc', screenscape: 'screenscape.me', vidrock: 'vidrock.ru', vidnest: 'new.vidnest.fun', netmirror: 'net27.cc', vidstorm: 'vidstorm.ru', vidlink: 'vidlink.pro', vidvault: 'vidvault.ru', modiplay: 'rozgarlelo.modiplay.xyz', cinehd: 'cinehd.vc', nxsha: 'nxsha.space', stellar: 'stellar.maybeoneday.ch', aphrodite: 'cdn.maybeoneday.ch' }
    const http = entry.adapter === 'static' ? undefined : createProviderHttp([origins[entry.adapter], ...entry.resolutionHosts, ...entry.mediaHosts], options.transport)
    const adapter = entry.adapter === 'static' ? createStaticProvider(entry.id, entry.entries)
      : entry.adapter === 'vixsrc' ? createVixsrcProvider(http!)
      : entry.adapter === 'nhdapi' ? createNhdapiProvider(http!)
      : entry.adapter === 'vaplayer' ? createVaPlayerProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'insertunit' ? createInsertunitProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'mapple' ? createMappleProvider(http!)
      : entry.adapter === 'stigstream' ? createStigstreamProvider(http!)
      : entry.adapter === 'wecollege' ? createWecollegeProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport), Date.now, { mediaHosts: entry.mediaHosts })
      : entry.adapter === 'perses' ? createPersesProvider(http!)
      : entry.adapter === 'rivestream' ? createRivestreamProvider(http!)
      : entry.adapter === 'vidapi' ? createVidapiProvider(http!)
      : entry.adapter === 'vidlove' ? createVidloveProvider(http!)
      : entry.adapter === 'screenscape' ? createScreenscapeProvider(http!)
      : entry.adapter === 'vidrock' ? createVidrockProvider(http!)
      : entry.adapter === 'vidnest' ? createVidnestProvider(http!)
      : entry.adapter === 'netmirror' ? createNetmirrorProvider(http!)
      : entry.adapter === 'vidstorm' ? createVidstormProvider(http!)
      : entry.adapter === 'vidlink' ? createVidlinkProvider(http!)
      : entry.adapter === 'vidvault' ? createVidvaultProvider(http!)
      : entry.adapter === 'modiplay' ? createModiplayProvider(http!)
      : entry.adapter === 'cinehd' ? createCinehdProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'nxsha' ? createNxshaProvider(http!)
      : entry.adapter === 'stellar' ? createStellarProvider(http!)
      : entry.adapter === 'aphrodite' ? createAphroditeProvider(http!)
      : createVidcoreProvider(http!)
    return { adapter, enabled: true, approvedRegions: entry.regions, mediaHosts: entry.mediaHosts,
      upstreamGroup: entry.upstreamGroup ?? entry.id, concurrency: entry.concurrency, requestsPerMinute: entry.requestsPerMinute,
      ...(entry.priority ? { priority: entry.priority } : {}) }
  })
}
