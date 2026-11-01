import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type PlaybackProgress } from '@consumit/contracts'
import { SessionProvider } from '../session/session'
import { titlePlayDestination, TitlePlayAction } from './title-play-action'

const progress: PlaybackProgress = { kind: 'series', id: 21, episode: 3, season: 2, completed: false, positionSeconds: 450, durationSeconds: 1400, updatedAt: '2026-10-03T00:00:00.000Z' }
const series = { kind: 'series' as const, id: 21, seasons: [{ number: 2, episodeCount: 3 }, { number: 3, episodeCount: 2 }] }
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

describe('title Play action', () => {
  it('shows the exact series episode it will resume and advances a completed season to the next known episode', () => {
    expect(titlePlayDestination(series, progress)).toEqual({ href: '/watch/series/21?season=2&episode=3', label: 'Continue watching', detail: 'Season 2 · Episode 3' })
    expect(titlePlayDestination(series, { ...progress, completed: true })).toEqual({ href: '/watch/series/21?season=3&episode=1', label: 'Continue watching', detail: 'Season 3 · Episode 1' })
    expect(titlePlayDestination(series, { ...progress, episode: 1, completed: true })).toEqual({ href: '/watch/series/21?season=2&episode=2', label: 'Continue watching', detail: 'Season 2 · Episode 2' })
  })
  it('continues anime and offers Watch again after its known final episode', () => {
    const title = { kind: 'anime' as const, id: 21, episodes: 4 }
    expect(titlePlayDestination(title, { ...progress, kind: 'anime', completed: true })).toEqual({ href: '/watch/anime/21?episode=4', label: 'Continue watching', detail: 'Episode 4' })
    expect(titlePlayDestination(title, { ...progress, kind: 'anime', episode: 4, completed: true })).toEqual({ href: '/watch/anime/21?episode=4', label: 'Watch again', detail: 'Episode 4' })
  })
  it('does not invent next episodes when metadata is missing or the series is finished', () => {
    expect(titlePlayDestination(series, { ...progress, season: 3, episode: 2, completed: true }).label).toBe('Watch again')
    expect(titlePlayDestination({ kind: 'anime', id: 21 }, { ...progress, kind: 'anime', completed: true }).href).toBe('/watch/anime/21?episode=3')
  })
  it('starts untouched titles normally and keeps movie and anime identities separate', () => {
    expect(titlePlayDestination(series, null)).toEqual({ href: '/watch/series/21?season=2&episode=1', label: 'Play' })
    expect(titlePlayDestination({ kind: 'movie', id: 21 }, progress).label).toBe('Play')
    expect(titlePlayDestination({ kind: 'movie', id: 21 }, { ...progress, kind: 'movie', completed: true }).label).toBe('Watch again')
  })
  it('labels a half-watched movie Play while resuming its saved position', () => {
    expect(titlePlayDestination({ kind: 'movie', id: 21 }, { ...progress, kind: 'movie', completed: false, positionSeconds: 450 })).toEqual({ href: '/watch/movie/21', label: 'Continue watching' })
  })
  it('continues local anime through the same action used by its detail hero', async () => {
    localStorage.setItem('consumit.progress:guest:anime:21:1:3', JSON.stringify({ ...progress, kind: 'anime', season: 1 }))
    render(<SessionProvider><TitlePlayAction id={21} kind="anime" episodes={4} /></SessionProvider>)
    const resume = await screen.findByRole('link', { name: 'Continue watching Episode 3' })
    expect(resume).toHaveAttribute('href', '/watch/anime/21?episode=3')
    expect(resume).toHaveTextContent('Episode 3')
  })
})
