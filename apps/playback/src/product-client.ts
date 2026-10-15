import { animeContextSchema, providerStateSchema, resolverMetadataSchema, subtitleCatalogRowsSchema } from '@consumit/contracts/internal'
import type { InternalClient } from '@consumit/server'
import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderConfigStore } from '../../api/src/admin/provider-config.ts'
import type { SubtitleCatalog } from '../../api/src/subtitles/catalog.ts'
import type { TitleMetadataResolver } from '../../api/src/playback/tmdb-metadata.ts'

export function createProductClient(call: InternalClient) {
  const state = async () => providerStateSchema.parse(await call('/v1/internal/playback/config', {}))
  const config: ProviderConfigStore & Required<Pick<ProviderConfigStore, 'getRevision'>> = {
    async getAll() { return (await state()).overrides },
    async getOverride(id) { return (await state()).overrides[id] },
    async getRevision() { return (await state()).revision },
    async setOverride() { throw new Error('Provider writes belong to the product API.') },
    async removeOverride() { throw new Error('Provider writes belong to the product API.') },
  }
  const anime = { async title(id: number) { return animeContextSchema.parse(await call('/v1/internal/playback/catalog', { mode: 'anime', ref: { kind: 'anime', id, episode: 1 } })) } }
  const metadata = async (providerId: string, ref: PlaybackRef, signal: AbortSignal) => resolverMetadataSchema.parse(await call('/v1/internal/playback/catalog', { mode: 'worker', providerId, ref }, { signal }))
  const tmdb: TitleMetadataResolver = async (ref, signal) => {
    const value = resolverMetadataSchema.parse(await call('/v1/internal/playback/catalog', { mode: 'tmdb', ref }, { signal }))
    if (!value.title || !value.year) throw new Error('Canonical metadata unavailable.')
    return { ...value, title: value.title, year: value.year }
  }
  const subtitles: SubtitleCatalog = {
    async find(ref, langs) { try { return subtitleCatalogRowsSchema.parse(await call('/v1/internal/playback/subtitles', { operation: 'find', ref, langs })) } catch { return [] } },
    async save(ref, tracks) { try { await call('/v1/internal/playback/subtitles', { operation: 'save', ref, tracks }) } catch { /* Subtitle metadata remains best effort. */ } },
  }
  return { config, snapshot: state, anime, metadata, tmdb, subtitles }
}

