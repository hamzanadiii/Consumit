import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { playbackRefSchema } from '@consumit/contracts'
import { createStaticProvider, createVixsrcProvider, createNhdapiProvider, createVaPlayerProvider, createMappleProvider, createWecollegeProvider, createPersesProvider, createRivestreamProvider, createVidapiProvider, createScreenscapeProvider, createVidrockProvider, createVidnestProvider, createPoseidonProvider, createNetmirrorProvider, createVidstormProvider, createVidlinkProvider, createCinehdProvider, createNxshaProvider, createStellarProvider, createAphroditeProvider, createVidluxProvider, createVidsrcbuzzProvider, createVidsrcProvider, createModiplayProvider, createVideasyProvider, createVidcoreProvider, createFilmuProvider, createAnixoProvider, createKyrenProvider, createNagareProvider, createAnime123Provider, createZokoProvider, createNineAnimeProvider, createAnibdProvider, providerSourceSchema, type AnimeTitleResolver, type MediaKind, type ProviderRegistration, type ZokoMetaResolver } from '@consumit/provider-sdk'
import { createProviderHttp } from './provider-http.ts'
import { createTmdbIdentityResolver } from './tmdb-identity.ts'
import { createTmdbMetadataResolver } from './tmdb-metadata.ts'
import type { MediaTransport } from './transport.ts'

const mediaKindsSchema = z.array(z.enum(['movie', 'series', 'anime'])).min(1).max(3)
const common = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  enabled: z.boolean().default(true),
  regions: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  mediaHosts: z.array(z.string().regex(/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/)).min(1).max(100),
  /** Regex sources for flux CDNs (rotating hostnames). Must compile;
   *  matched case-insensitively against the lowercase hostname. */
  mediaHostPatterns: z.array(z.string().min(1).max(100).refine((source) => {
    try {
      new RegExp(source)
      return true
    } catch {
      return false
    }
  }, 'Invalid media host pattern.')).max(10).default([]),
  upstreamGroup: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
  concurrency: z.number().int().min(1).max(4).default(2),
  requestsPerMinute: z.number().int().min(1).max(120).default(30),
  priority: z.number().int().min(0).max(100).default(0),
  proxy: z.boolean().default(true),
  attemptMs: z.number().int().min(1000).max(15000).default(5000),
  mediaKinds: mediaKindsSchema.default(['movie', 'series']),
})
const configurationSchema = z.array(z.union([
  common.extend({ adapter: z.literal('static').default('static'),
  entries: z.array(z.object({ ref: playbackRefSchema, sources: z.array(providerSourceSchema).max(32) })).max(1000),
  }),
  common.extend({ adapter: z.enum(['vixsrc', 'vixsrc-it', 'nhdapi', 'vaplayer', 'mapple', 'wecollege', 'perses', 'rivestream', 'riveapex', 'rivevanguard', 'riveaura', 'riveapogee', 'rivecitadel', 'riverigel', 'vidapi', 'screenscape', 'vidrock', 'vidnest', 'catflix', 'poseidon', 'netmirror', 'vidstorm', 'vidlink', 'cinehd', 'nxsha', 'stellar', 'aphrodite', 'vidlux', 'vidsrcbuzz', 'vidsrc', 'modiplay', 'videasy', 'vidcore', 'filmu', 'anixo', 'kyren', 'nagare', 'anime123', 'zoko', 'nineanime', 'anibd']),
    resolutionHosts: z.array(z.string().regex(/^[a-z0-9.-]+$/)).max(30).default([]),
    upstreamGroup: z.string().regex(/^[a-z0-9-]{1,60}$/),
  }),
  // Room for the full adapter registry plus scoped aliases; per-provider
  // concurrency, rate limits, and hedged resolution bound load instead.
])).max(64)

type ProviderOptions = { tmdbToken?: string | undefined; transport?: MediaTransport; animeTitleResolver?: AnimeTitleResolver | undefined; animeMetaResolver?: ZokoMetaResolver | undefined }

/** Explicit operator configuration for configured media; never imports the research registry. */
export async function loadConfiguredProviders(path?: string, options: ProviderOptions = {}): Promise<ProviderRegistration[]> {
  if (!path) return []
  const raw = await readFile(path, 'utf8')
  if (raw.length > 2_000_000) throw new Error('Playback media configuration exceeds its limit.')
  return configuredProviders(JSON.parse(raw), options)
}

export function applyProviderOverrides(providers: ProviderRegistration[], overrides: Record<string, { enabled?: boolean; proxy?: boolean; priority?: number }>): ProviderRegistration[] {
  return providers.map((p) => {
    const patch = overrides[p.adapter.id]
    if (!patch) return p
    return {
      ...p,
      enabled: patch.enabled ?? p.enabled,
      proxy: patch.proxy ?? p.proxy,
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    }
  })
}

export function configuredProviders(configuration: unknown, options: ProviderOptions = {}): ProviderRegistration[] {
  const parsed = configurationSchema.parse(configuration)
  if (new Set(parsed.map((entry) => entry.id)).size !== parsed.length) throw new Error('Duplicate playback provider id.')
  // No active-provider ceiling: per-provider concurrency, rate limits, and
  // bounded sequential attempts (first provider, then the next) keep load
  // in check instead.
  const active = parsed.filter((entry) => entry.enabled)
  return active.map((entry) => {
    // Alias convention: an entry id must equal its adapter or extend it with
    // a `-suffix` (wecollege-phoenix, cinehd-hindi). Aliases let one adapter
    // serve scoped rows (city, audio) with independent regions, health, and
    // fallback groups; the suffix selects the scope below.
    if (entry.adapter !== 'static' && entry.id !== entry.adapter && !entry.id.startsWith(`${entry.adapter}-`)) throw new Error('Imported provider id must match its adapter or extend it with -suffix.')
    if ((entry.adapter === 'anixo' || entry.adapter === 'kyren' || entry.adapter === 'anime123' || entry.adapter === 'nineanime') && !options.animeTitleResolver) throw new Error('Anime providers require an anime title resolver.')
    if (entry.adapter === 'zoko' && !options.animeMetaResolver) throw new Error('Zoko requires an anime meta resolver.')
    const animeAdapters = new Set(['anixo', 'kyren', 'nagare', 'anime123', 'zoko', 'nineanime', 'anibd'])
    if (animeAdapters.has(entry.adapter) && !(entry.mediaKinds as readonly string[]).includes('anime')) throw new Error(`Anime adapter "${entry.adapter}" must include "anime" in mediaKinds.`)
    if (!animeAdapters.has(entry.adapter) && (entry.mediaKinds as readonly string[]).includes('anime')) throw new Error(`Non-anime adapter "${entry.adapter}" cannot include "anime" in mediaKinds.`)
    const origins = { vixsrc: 'vixsrc.to', 'vixsrc-it': 'vixsrc.to', nhdapi: 'nhdapi.com', vaplayer: 'streamdata.vaplayer.ru', mapple: 'mapple.rip', wecollege: 'api.wecollege.net', perses: 'streamguide.cfd', rivestream: 'scrapper.rivestream.app', riveapex: 'scrapper.rivestream.app', rivevanguard: 'scrapper.rivestream.app', riveaura: 'scrapper.rivestream.app', riveapogee: 'scrapper.rivestream.app', rivecitadel: 'scrapper.rivestream.app', riverigel: 'scrapper.rivestream.app', vidapi: 'streamdata.vaplayer.ru', screenscape: 'screenscape.me', vidrock: 'vidrock.to', vidnest: 'new.vidnest.fun', catflix: 'new.vidnest.fun', poseidon: 'hahaevilcraft.site', netmirror: 'net27.cc', vidstorm: 'vidstorm.ru', vidlink: 'vidlink.pro', cinehd: 'cinehd.vc', nxsha: 'nxsha.space', stellar: 'stellar.maybeoneday.ch', aphrodite: 'cdn.hls.lol', vidlux: 'vidlux.xyz', vidsrcbuzz: 'vidsrc.buzz', vidsrc: 'vsembed.ru', modiplay: 'rozgarlelo.modiplay.xyz', videasy: 'api.speedracelight.com', vidcore: 'vidrack.created.app', filmu: 'api.filmu.in', anixo: 'anixo.buzz', kyren: 'kyren.moe', nagare: 'nagare.nexioapp.org', anime123: '123anime.la', zoko: 'zokoanime.video', nineanime: 'new.vidnest.fun', anibd: 'epeng.animeapps.top' }
    // Sibling resolution hosts an adapter fails over to on its own; kept
    // explicit so the DNS-pinned transport allowlist covers them by default.
    const siblingHosts: Record<string, readonly string[]> = { videasy: ['api.videasy.to'], vidcore: ['hahaevilcraft.site', 'movie.streamrip.fun', 'streamguide.cfd'], filmu: ['embed.filmu.in'] }
    const http = entry.adapter === 'static' ? undefined : createProviderHttp([origins[entry.adapter], ...siblingHosts[entry.adapter] ?? [], ...entry.resolutionHosts, ...entry.mediaHosts], options.transport)
    const adapter = entry.adapter === 'static' ? createStaticProvider(entry.id, entry.entries)
      : entry.adapter === 'vixsrc' ? createVixsrcProvider(http!)
      : entry.adapter === 'vixsrc-it' ? createVixsrcProvider(http!, Date.now, { id: 'vixsrc-it' })
      : entry.adapter === 'nhdapi' ? createNhdapiProvider(http!)
      : entry.adapter === 'vaplayer' ? createVaPlayerProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'mapple' ? createMappleProvider(http!)
      : entry.adapter === 'wecollege' ? createWecollegeProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport), Date.now, { mediaHosts: entry.mediaHosts, ...(entry.id !== 'wecollege' ? { id: entry.id, cities: [entry.id.replace(/^wecollege-/, '')] } : {}) })
      : entry.adapter === 'perses' ? createPersesProvider(http!)
      : entry.adapter === 'rivestream' ? createRivestreamProvider(http!, Date.now, { ...(entry.id !== 'rivestream' ? { id: entry.id, subs: [entry.id.replace(/^rivestream-/, '')] } : {}) })
      : entry.adapter === 'riveapex' ? createRivestreamProvider(http!, Date.now, { id: 'riveapex', subs: ['apex'] })
      : entry.adapter === 'rivevanguard' ? createRivestreamProvider(http!, Date.now, { id: 'rivevanguard', subs: ['vanguard'] })
      : entry.adapter === 'riveaura' ? createRivestreamProvider(http!, Date.now, { id: 'riveaura', subs: ['aura'] })
      : entry.adapter === 'riveapogee' ? createRivestreamProvider(http!, Date.now, { id: 'riveapogee', subs: ['apogee'], kinds: ['movie'] })
      : entry.adapter === 'rivecitadel' ? createRivestreamProvider(http!, Date.now, { id: 'rivecitadel', subs: ['citadel'] })
      : entry.adapter === 'riverigel' ? createRivestreamProvider(http!, Date.now, { id: 'riverigel', subs: ['rigel'] })
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
      : entry.adapter === 'modiplay' ? createModiplayProvider(http!)
      : entry.adapter === 'vidcore' ? createVidcoreProvider(http!, Date.now, { ...(entry.id !== 'vidcore' ? { id: entry.id, servers: [entry.id.replace(/^vidcore-/, '')] } : {}) })
      : entry.adapter === 'filmu' ? createFilmuProvider(http!, createTmdbIdentityResolver(options.tmdbToken ?? '', options.transport))
      : entry.adapter === 'anixo' ? createAnixoProvider(http!, options.animeTitleResolver!)
      : entry.adapter === 'kyren' ? createKyrenProvider(http!, options.animeTitleResolver!)
      : entry.adapter === 'nagare' ? createNagareProvider(http!)
      : entry.adapter === 'anime123' ? createAnime123Provider(http!, options.animeTitleResolver!)
      : entry.adapter === 'zoko' ? createZokoProvider(http!, options.animeMetaResolver!)
      : entry.adapter === 'nineanime' ? createNineAnimeProvider(http!, options.animeTitleResolver!)
      : entry.adapter === 'anibd' ? createAnibdProvider(http!)
      : createVideasyProvider(http!, createTmdbMetadataResolver(options.tmdbToken ?? '', options.transport), Date.now, { mediaHosts: entry.mediaHosts })
    return { adapter, enabled: true, approvedRegions: entry.regions, mediaHosts: entry.mediaHosts,
      mediaHostPatterns: entry.mediaHostPatterns.map((source) => new RegExp(source, 'i')),
      upstreamGroup: entry.upstreamGroup ?? entry.id, concurrency: entry.concurrency, requestsPerMinute: entry.requestsPerMinute,
      mediaKinds: entry.mediaKinds as readonly MediaKind[],
      ...(entry.priority ? { priority: entry.priority } : {}),
      ...(entry.attemptMs !== 5000 ? { attemptMs: entry.attemptMs } : {}),
      proxy: entry.proxy }
  })
}
