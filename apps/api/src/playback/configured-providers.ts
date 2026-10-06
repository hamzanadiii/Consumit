import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { playbackRefSchema, providerRoleSchema, providerDeliveryModeSchema } from '@consumit/contracts'
import { createFrameProvider, createRigelProvider, createAnimeRelayProvider, createStormBoronProvider, createBingeBangYMoviesProvider, createStaticProvider, createVixsrcProvider, createNhdapiProvider, createVaPlayerProvider, createMappleProvider, createWecollegeProvider, createPersesProvider, createRivestreamProvider, createVidapiProvider, createScreenscapeProvider, createVidrockProvider, createVidnestProvider, createPoseidonProvider, createNetmirrorProvider, createVidstormProvider, createVidlinkProvider, createCinehdProvider, createNxshaProvider, createStellarProvider, createAphroditeProvider, createVidluxProvider, createVidsrcbuzzProvider, createVidsrcProvider, createVideasyProvider, createVidcoreProvider, createFilmuProvider, createVidzenProvider, createLookmovieProvider, createRiveApolloProvider, createEvionProvider, createCinejoyLisbonProvider, createStigstreamProvider, createCastletvProvider, createAnixoProvider, createKyrenProvider, createNagareProvider, createAnime123Provider, createZokoProvider, createAnimeParadiseProvider, createAnimeKaiProvider, createAnimeKitsuProvider, createRecloudProvider, providerSourceSchema, type AnimeTitleResolver, type AnimeTitleVariantsResolver, type MediaKind, type ProviderRegistration, type ZokoMetaResolver } from '@consumit/provider-sdk'
import { createProviderHttp } from './provider-http.ts'
import { createTmdbIdentityResolver } from './tmdb-identity.ts'
import { createTmdbMetadataResolver } from './tmdb-metadata.ts'
import type { MediaTransport } from './transport.ts'

const mediaKindsSchema = z.array(z.enum(['movie', 'series', 'anime'])).min(1).max(3)
const sharedHostingRoots = ['workers.dev', 'vercel.app', 'netlify.app', 'pages.dev', 'github.io', 'web.app', 'firebaseapp.com'] as const
function isCrossTenantWildcard(host: string) {
  if (!host.startsWith('*.')) return false
  const suffix = host.slice(2).toLowerCase()
  return sharedHostingRoots.includes(suffix as typeof sharedHostingRoots[number])
}
function isSharedHostingPattern(source: string) {
  try {
    const pattern = new RegExp(source, 'i')
    return sharedHostingRoots.some((root) => pattern.test(`tenant.${root}`) || pattern.test(`media.tenant.${root}`))
  } catch { return false }
}
function isGenericHostPattern(source: string) {
  try {
    const pattern = new RegExp(source, 'i')
    return [
      'tenant.site', 'srv1.tenant.site', 'long-random-tenant.site', 'img1.tenant.com', 'cdn.tenant.com',
    ].some((host) => pattern.test(host))
  } catch { return false }
}

const common = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  enabled: z.boolean().default(true),
  role: providerRoleSchema.default('video'),
  deliveryMode: providerDeliveryModeSchema.default('direct'),
  relayHostDiscovery: z.enum(['storm-boron-v1', 'wecollege-city-v1']).optional(),
  regions: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  mediaHosts: z.array(z.string().regex(/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/)
    .refine((host) => !isCrossTenantWildcard(host), 'Wildcard media hosts cannot target a shared hosting domain.'))
    .min(1).max(100),
  /** Regex sources for flux CDNs (rotating hostnames). Must compile;
   *  matched case-insensitively against the lowercase hostname. */
  mediaHostPatterns: z.array(z.string().min(1).max(100).refine((source) => {
    try {
      new RegExp(source)
      return true
    } catch {
      return false
    }
  }, 'Invalid media host pattern.')
    .refine((source) => !isSharedHostingPattern(source), 'Media host patterns cannot target shared hosting domains.')
    .refine((source) => !isGenericHostPattern(source), 'Media host patterns must be scoped to a provider-owned hostname.'))
    .max(10).default([]),
  probes: z.object({
    movie: z.object({ ref: playbackRefSchema, audioLanguage: z.string().min(1).max(32).default('en') }).optional(),
    series: z.object({ ref: playbackRefSchema, audioLanguage: z.string().min(1).max(32).default('en') }).optional(),
    anime: z.object({ ref: playbackRefSchema, audioLanguage: z.string().min(1).max(32).default('ja') }).optional(),
  }).strict().optional(),
  upstreamGroup: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
  concurrency: z.number().int().min(1).max(4).default(2),
  requestsPerMinute: z.number().int().min(1).max(120).default(30),
  priority: z.number().int().min(0).max(100).default(0),
  attemptMs: z.number().int().min(1000).max(15000).default(3000),
  mediaKinds: mediaKindsSchema.default(['movie', 'series']),
})
const configurationSchema = z.array(z.union([
  common.extend({ adapter: z.literal('static').default('static'),
  entries: z.array(z.object({ ref: playbackRefSchema, sources: z.array(providerSourceSchema).max(32) })).max(1000),
  }),
  common.extend({ adapter: z.enum(['vixsrc', 'vixsrc-it', 'nhdapi', 'vaplayer', 'mapple', 'wecollege', 'perses', 'rivestream', 'riveapex', 'rivevanguard', 'riveaura', 'riveapogee', 'rivecitadel', 'riverigel', 'riveapollo', 'evion', 'cinejoylisbon', 'vidapi', 'screenscape', 'vidrock', 'vidnest', 'catflix', 'poseidon', 'netmirror', 'vidstorm', 'vidlink', 'cinehd', 'nxsha', 'stellar', 'aphrodite', 'vidlux', 'vidsrcbuzz', 'vidsrc', 'videasy', 'vidcore', 'filmu', 'filmuainary', 'vidzen', 'lookmovie', 'stignebula', 'stigorion', 'castletv', 'anixo', 'kyren', 'nagare', 'anime123', 'zoko', 'animeparadise', 'animekai', 'animekitsu', 'recloud', 'megavid', '9anime', 'aniwave', 'stormboron', 'zeta', 'rivenebula', 'rivezephyr', 'bingebangymovies', 'rigel', 'stigstream', 'reanimeframe', 'megaplayframe', 'apiplayerframe', 'embedapiframe', 'vsembedframe']),
    resolutionHosts: z.array(z.string().regex(/^[a-z0-9.-]+$/)).max(30).default([]),
    upstreamGroup: z.string().regex(/^[a-z0-9-]{1,60}$/),
  }),
  // Room for the full adapter registry plus scoped aliases; per-provider
  // concurrency, rate limits, and hedged resolution bound load instead.
])).max(64)

type ProviderOptions = {
  tmdbToken?: string | undefined
  transport?: MediaTransport
  animeTitleResolver?: AnimeTitleResolver | undefined
  animeTitleVariantsResolver?: AnimeTitleVariantsResolver | undefined
  animeMetaResolver?: ZokoMetaResolver | undefined
}

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
  // No active-provider ceiling: per-provider concurrency, rate limits, and
  // bounded sequential attempts (first provider, then the next) keep load
  // in check instead.
  // Register disabled rows too, so Admin can enable them without a restart.
  return parsed.map((entry) => {
    if (entry.relayHostDiscovery && !(entry.adapter === 'stormboron' && entry.id === 'stormboron' && entry.relayHostDiscovery === 'storm-boron-v1'
      || entry.adapter === 'wecollege' && ['wecollege-miami', 'wecollege-boise'].includes(entry.id) && entry.relayHostDiscovery === 'wecollege-city-v1')) throw new Error('Relay discovery requires its reviewed adapter recipe.')
    const frameAdapters = new Set(['reanimeframe', 'megaplayframe', 'apiplayerframe', 'embedapiframe', 'vsembedframe'])
    if (frameAdapters.has(entry.adapter) !== (entry.deliveryMode === 'embed') && entry.adapter !== 'static') throw new Error('Frame adapters require embed delivery; media adapters cannot use it.')
    if (entry.adapter === 'megaplayframe' && !options.animeTitleVariantsResolver) throw new Error('MegaPlay Frame requires canonical anime title variants.')
    if (entry.adapter === 'evion' && (entry.id !== 'evion' || entry.mediaKinds.length !== 1 || entry.mediaKinds[0] !== 'series')) throw new Error('Evion TV requires one series-only row named evion.')
    for (const [kind, probe] of Object.entries(entry.probes ?? {})) {
      if (probe && (probe.ref.kind !== kind || !entry.mediaKinds.includes(kind as MediaKind))) {
        throw new Error(`Provider "${entry.id}" probe must match one of its configured media kinds.`)
      }
    }
    // Alias convention: an entry id must equal its adapter or extend it with
    // a `-suffix` (wecollege-phoenix, cinehd-hindi). Aliases let one adapter
    // serve scoped rows (city, audio) with independent regions, health, and
    // fallback groups; the suffix selects the scope below.
    if (entry.adapter !== 'static' && entry.id !== entry.adapter && !entry.id.startsWith(`${entry.adapter}-`)) throw new Error('Imported provider id must match its adapter or extend it with -suffix.')
    if (entry.adapter === 'recloud' && (entry.id !== 'recloud' || entry.mediaKinds.some(kind => kind !== 'anime'))) throw new Error('Recloud requires one anime-only row named recloud.')
    if ((entry.adapter === 'anixo' || entry.adapter === 'kyren' || entry.adapter === 'anime123' || entry.adapter === 'animeparadise' || entry.adapter === 'animekai' || entry.adapter === 'animekitsu') && !options.animeTitleResolver) throw new Error('Anime providers require an anime title resolver.')
    if (entry.adapter === 'zoko' && !options.animeMetaResolver) throw new Error('Zoko requires an anime meta resolver.')
    const animeAdapters = new Set(['anixo', 'kyren', 'nagare', 'anime123', 'zoko', 'animeparadise', 'animekai', 'animekitsu', 'recloud', 'megavid', '9anime', 'aniwave', 'reanimeframe', 'megaplayframe'])
    if (animeAdapters.has(entry.adapter) && !(entry.mediaKinds as readonly string[]).includes('anime')) throw new Error(`Anime adapter "${entry.adapter}" must include "anime" in mediaKinds.`)
    if (!animeAdapters.has(entry.adapter) && (entry.mediaKinds as readonly string[]).includes('anime')) throw new Error(`Non-anime adapter "${entry.adapter}" cannot include "anime" in mediaKinds.`)
    const origins = { rigel: 'movish.to', stigstream: 'api.stigstream.ru', reanimeframe: 'reanime.to', megaplayframe: 'anikage.cc', apiplayerframe: 'apiplayer.ru', embedapiframe: 'watch.embed-api.stream', vsembedframe: 'vsembed.ru', vixsrc: 'vixsrc.to', 'vixsrc-it': 'vixsrc.to', nhdapi: 'nhdapi.com', vaplayer: 'streamdata.vaplayer.ru', mapple: 'mapple.rip', wecollege: 'api.wecollege.net', perses: 'streamguide.cfd', rivestream: 'scrapper.rivestream.app', riveapex: 'scrapper.rivestream.app', rivevanguard: 'scrapper.rivestream.app', riveaura: 'scrapper.rivestream.app', riveapogee: 'scrapper.rivestream.app', rivecitadel: 'scrapper.rivestream.app', riverigel: 'scrapper.rivestream.app', riveapollo: 'scrapper.rivestream.app', evion: 'api.bingr.one', cinejoylisbon: 'api.wing.st', vidapi: 'streamdata.vaplayer.ru', screenscape: 'screenscape.me', vidrock: 'vidrock.to', vidnest: 'new.vidnest.fun', catflix: 'new.vidnest.fun', poseidon: 'hahaevilcraft.site', netmirror: 'net27.cc', vidstorm: 'vidstorm.ru', vidlink: 'vidlink.pro', cinehd: 'cinehd.vc', nxsha: 'nxsha.space', stellar: 'stellar.maybeoneday.ch', aphrodite: 'cdn.hls.lol', vidlux: 'vidlux.xyz', vidsrcbuzz: 'vidsrc.buzz', vidsrc: 'vsembed.ru', videasy: 'api.speedracelight.com', vidcore: 'vidrack.created.app', filmu: 'api.filmu.in', filmuainary: 'api.filmu.in', vidzen: 'vidzen.fun', lookmovie: 'lmscript.xyz', stignebula: 'api.stigstream.ru', stigorion: 'api.stigstream.ru', castletv: 'api.hlowb.com', anixo: 'anixo.buzz', kyren: 'kyren.moe', nagare: 'nagare.nexioapp.org', anime123: '123anime.la', zoko: 'zokoanime.video', animeparadise: 'api.animeparadise.moe', animekai: 'animekai.stream', animekitsu: 'animekitsu.com', recloud: 'cdn.4animo.xyz', megavid: 'megavid.buzz', '9anime': 'new.vidnest.fun', aniwave: 'new.vidnest.fun', stormboron: 'vidstorm.to', zeta: 'new.vidnest.fun', rivenebula: 'scrapper.rivestream.app', rivezephyr: 'scrapper.rivestream.app', bingebangymovies: 'bingebang.st' }
    // Sibling resolution hosts an adapter fails over to on its own; kept
    // explicit so the DNS-pinned transport allowlist covers them by default.
    const siblingHosts: Record<string, readonly string[]> = { videasy: ['api.videasy.to'], vidcore: ['hahaevilcraft.site', 'movie.streamrip.fun', 'streamguide.cfd'], filmu: ['embed.filmu.in'], filmuainary: ['embed.filmu.in'], aphrodite: ['stream.hls.lol'], animekai: ['mfw09.org'], stormboron: ['vidstorm.ru'] }
    const http = entry.adapter === 'static' ? undefined : createProviderHttp([origins[entry.adapter], ...siblingHosts[entry.adapter] ?? [], ...entry.resolutionHosts, ...entry.mediaHosts], options.transport, Boolean(entry.relayHostDiscovery))
    const adapter = entry.adapter === 'static' ? createStaticProvider(entry.id, entry.entries)
      : entry.adapter === 'rigel' ? createRigelProvider(http!)
      : entry.adapter === 'stigstream' ? createStigstreamProvider(http!, Date.now, { id: 'stigstream', servers: ['Nova', 'Comet', 'Nebula', 'Cosmic', 'Obsidian', 'Flux'], mediaHosts: entry.mediaHosts })
      : entry.adapter === 'reanimeframe' || entry.adapter === 'megaplayframe' || entry.adapter === 'apiplayerframe' || entry.adapter === 'embedapiframe' || entry.adapter === 'vsembedframe' ? createFrameProvider(entry.adapter, http!, options.animeTitleVariantsResolver)
      : entry.adapter === 'vixsrc' ? createVixsrcProvider(http!)
      : entry.adapter === 'vixsrc-it' ? createVixsrcProvider(http!, Date.now, { id: 'vixsrc-it' })
      : entry.adapter === 'nhdapi' ? createNhdapiProvider(http!)
      : entry.adapter === 'vaplayer' ? createVaPlayerProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'mapple' ? createMappleProvider(http!)
      : entry.adapter === 'wecollege' ? createWecollegeProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport), Date.now, { mediaHosts: entry.mediaHosts, relayHostDiscovery: Boolean(entry.relayHostDiscovery), ...(entry.id !== 'wecollege' ? { id: entry.id, cities: [entry.id.replace(/^wecollege-/, '')] } : {}) })
      : entry.adapter === 'perses' ? createPersesProvider(http!)
      : entry.adapter === 'rivestream' ? createRivestreamProvider(http!, Date.now, { ...(entry.id !== 'rivestream' ? { id: entry.id, subs: [entry.id.replace(/^rivestream-/, '')] } : {}) })
      : entry.adapter === 'riveapex' ? createRivestreamProvider(http!, Date.now, { id: 'riveapex', subs: ['apex'] })
      : entry.adapter === 'rivevanguard' ? createRivestreamProvider(http!, Date.now, { id: 'rivevanguard', subs: ['vanguard'] })
      : entry.adapter === 'riveaura' ? createRivestreamProvider(http!, Date.now, { id: 'riveaura', subs: ['aura'] })
      : entry.adapter === 'riveapogee' ? createRivestreamProvider(http!, Date.now, { id: entry.id, subs: ['apogee'] })
      : entry.adapter === 'rivecitadel' ? createRivestreamProvider(http!, Date.now, { id: 'rivecitadel', subs: ['citadel'] })
      : entry.adapter === 'riverigel' ? createRivestreamProvider(http!, Date.now, { id: 'riverigel', subs: ['rigel'] })
      : entry.adapter === 'evion' ? createEvionProvider(http!)
      : entry.adapter === 'cinejoylisbon' ? createCinejoyLisbonProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'riveapollo' ? createRiveApolloProvider(http!)
      : entry.adapter === 'vidapi' ? createVidapiProvider(http!)
      : entry.adapter === 'screenscape' ? createScreenscapeProvider(http!)
      : entry.adapter === 'vidrock' ? createVidrockProvider(http!, Date.now, { ...(entry.id !== 'vidrock' ? { id: entry.id, servers: [entry.id.replace(/^vidrock-/, '')] } : {}) })
      : entry.adapter === 'vidnest' ? createVidnestProvider(http!)
      : entry.adapter === 'catflix' ? createVidnestProvider(http!, Date.now, { id: 'catflix', servers: ['catflix'] })
      : entry.adapter === 'poseidon' ? createPoseidonProvider(http!)
      : entry.adapter === 'netmirror' ? createNetmirrorProvider(http!)
      : entry.adapter === 'vidstorm' ? createVidstormProvider(http!)
      : entry.adapter === 'vidlink' ? createVidlinkProvider(http!)
      : entry.adapter === 'cinehd' ? createCinehdProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport), Date.now, {
        ...(entry.id !== 'cinehd' ? { id: entry.id } : {}),
        ...(entry.id === 'cinehd-hindi' ? { audio: 'hi' as const } : entry.id === 'cinehd-english' ? { audio: 'en' as const } : {}),
      })
      : entry.adapter === 'nxsha' ? createNxshaProvider(http!)
      : entry.adapter === 'stellar' ? createStellarProvider(http!)
      : entry.adapter === 'aphrodite' ? createAphroditeProvider(http!)
      : entry.adapter === 'vidlux' ? createVidluxProvider(http!)
      : entry.adapter === 'vidsrcbuzz' ? createVidsrcbuzzProvider(http!)
      : entry.adapter === 'vidsrc' ? createVidsrcProvider(http!)
      : entry.adapter === 'vidcore' ? createVidcoreProvider(http!, Date.now, { ...(entry.id !== 'vidcore' ? { id: entry.id, servers: [entry.id.replace(/^vidcore-/, '')] } : {}) })
      : entry.adapter === 'filmu' ? createFilmuProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'filmuainary' ? createFilmuProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport), Date.now, { id: 'filmuainary', extractors: ['Ainary'] })
      : entry.adapter === 'vidzen' ? createVidzenProvider(http!)
      : entry.adapter === 'lookmovie' ? createLookmovieProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'stignebula' ? createStigstreamProvider(http!, Date.now, { id: 'stignebula', server: 'Nebula', audioLanguage: 'original' })
      : entry.adapter === 'stigorion' ? createStigstreamProvider(http!, Date.now, { id: 'stigorion', server: 'Orion', audioLanguage: 'tr' })
      : entry.adapter === 'castletv' ? createCastletvProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'anixo' ? createAnixoProvider(http!, options.animeTitleResolver!)
      : entry.adapter === 'kyren' ? createKyrenProvider(http!, options.animeTitleResolver!, Date.now, { ...(entry.id !== 'kyren' ? { id: entry.id, servers: [entry.id.replace(/^kyren-/, '')] } : {}) })
      : entry.adapter === 'nagare' ? createNagareProvider(http!)
      : entry.adapter === 'anime123' ? createAnime123Provider(http!, options.animeTitleResolver!)
      : entry.adapter === 'zoko' ? createZokoProvider(http!, options.animeMetaResolver!)
      : entry.adapter === 'animeparadise' ? createAnimeParadiseProvider(http!, options.animeTitleResolver!, Date.now, options.animeTitleVariantsResolver)
      : entry.adapter === 'animekai' ? createAnimeKaiProvider(http!, options.animeTitleResolver!)
      : entry.adapter === 'animekitsu' ? createAnimeKitsuProvider(http!, options.animeTitleResolver!, Date.now, options.animeTitleVariantsResolver)
      : entry.adapter === 'megavid' || entry.adapter === '9anime' || entry.adapter === 'aniwave' ? createAnimeRelayProvider(http!, entry.adapter)
      : entry.adapter === 'stormboron' ? createStormBoronProvider(http!)
      : entry.adapter === 'bingebangymovies' ? createBingeBangYMoviesProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'zeta' ? createVidnestProvider(http!, Date.now, { id: 'zeta', servers: ['zeta'] })
      : entry.adapter === 'rivenebula' || entry.adapter === 'rivezephyr' ? createRivestreamProvider(http!, Date.now, { id: entry.id, subs: [entry.adapter.slice(4)], relay: true })
      : entry.adapter === 'recloud' ? createRecloudProvider(http!)
      : createVideasyProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport), Date.now, { mediaHosts: entry.mediaHosts })
    return { adapter, enabled: entry.enabled, role: entry.role, deliveryMode: entry.deliveryMode, relayHostDiscovery: entry.relayHostDiscovery, approvedRegions: entry.regions, mediaHosts: entry.mediaHosts,
      mediaHostPatterns: entry.mediaHostPatterns.map((source) => new RegExp(source, 'i')),
      upstreamGroup: entry.upstreamGroup ?? entry.id, concurrency: entry.concurrency, requestsPerMinute: entry.requestsPerMinute,
      mediaKinds: entry.mediaKinds as readonly MediaKind[],
      ...(entry.priority ? { priority: entry.priority } : {}),
      ...(entry.attemptMs !== 3000 ? { attemptMs: entry.attemptMs } : {}),
      ...(entry.probes ? { probes: entry.probes } : {}) }
  })
}
