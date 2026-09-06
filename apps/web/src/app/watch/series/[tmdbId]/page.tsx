import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CatalogApiError, getCatalogSeason, getCatalogTitle } from '@/lib/catalog-api'

import { CatalogUnavailableScreen } from '../../../catalog/catalog-ui'
import { WatchScreen } from '../../watch-screen'

type SeriesWatchPageProps = {
  params: Promise<{ tmdbId: string }>
  searchParams: Promise<{ episode?: string | string[]; season?: string | string[] }>
}

export async function generateMetadata({ params }: SeriesWatchPageProps): Promise<Metadata> {
  const noindex = { robots: { follow: false, index: false } } as const
  const id = Number((await params).tmdbId)
  if (!Number.isInteger(id) || id <= 0) return { ...noindex, title: 'Watch · Consumit' }
  try { const { item } = await getCatalogTitle('series', id); return { ...noindex, title: `Watch ${item.title} · Consumit` } } catch { return { ...noindex, title: 'Watch · Consumit' } }
}

export default async function SeriesWatchPage({ params, searchParams }: SeriesWatchPageProps) {
  const id = Number((await params).tmdbId)
  const query = await searchParams
  const seasonValue = Array.isArray(query.season) ? query.season[0] : query.season
  const episodeValue = Array.isArray(query.episode) ? query.episode[0] : query.episode
  const seasonNumber = Number(seasonValue ?? 1)
  const episodeNumber = Number(episodeValue ?? 1)
  if (![id, seasonNumber, episodeNumber].every((value) => Number.isInteger(value) && value > 0)) notFound()
  let titleResponse
  try { titleResponse = await getCatalogTitle('series', id) } catch (error) { if (error instanceof CatalogApiError && error.status === 404) notFound(); return <CatalogUnavailableScreen error={error} /> }
  if (titleResponse.item.kind !== 'series') notFound()
  const season = await getCatalogSeason(id, seasonNumber).catch(() => null)
  const episode = season?.item.episodes.find((item) => item.episodeNumber === episodeNumber)
  return <WatchScreen {...(episode ? { episode } : {})} title={titleResponse.item} />
}
