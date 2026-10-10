import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { defaultExperiencePreferences, type AnimeTitleDetail } from '@consumit/contracts'
import { AnimeWatchScreen } from './anime-watch-screen'
const mocks = vi.hoisted(() => ({ patch: vi.fn(async () => {}), push: vi.fn(), audio: 'dub' as 'sub' | 'dub' }))
vi.mock('../../experience/experience-provider', () => ({ useExperience: () => ({ ready: true, owner: 'member', error: null, preferences: { ...defaultExperiencePreferences(), animeAudio: mocks.audio }, patch: mocks.patch }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('../../anime/use-episode-art', () => ({ useEpisodeArt: () => null }))
vi.mock('@/lib/anime-browser', () => ({ browserAnimeEpisodes: async () => [] }))
vi.mock('../watch-playback', () => ({ WatchPlayback: ({ audioLanguage, nextHref }: { audioLanguage: string; nextHref?: string }) => <><p>Playback audio: {audioLanguage}</p><a href={nextHref}>Next episode</a></> }))
vi.mock('../../shared/ad-slot', () => ({ AdSlot: () => null }))
const detail: AnimeTitleDetail = {
  anilistId: 21, kind: 'anime', titles: { preferred: 'Evening stories', english: null, romaji: null, native: null }, format: 'TV', status: 'FINISHED', season: null, seasonYear: 2026, episodes: 2, episodeDuration: 24, genres: [], coverImage: { url: null, color: null }, bannerImage: null, averageScore: null, popularity: 0, description: 'Two quiet evenings.', nextAiringEpisode: null,
  malId: null, logoUrl: null, source: null, countryOfOrigin: 'JP', trailer: null, characters: [], staff: [], streamingEpisodes: [], externalLinks: [], recommendations: [],
}
beforeEach(() => { vi.clearAllMocks(); mocks.audio = 'dub' })
it('opens the saved DUB lane, retains it during background preference changes and carries it into episode navigation', () => {
  const view = render(<AnimeWatchScreen detail={detail} episode={1} nextHref="/watch/anime/21?episode=2" />)
  expect(screen.getByText('Playback audio: en')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Next episode' })).toHaveAttribute('href', '/watch/anime/21?episode=2&audio=dub')
  mocks.audio = 'sub'; view.rerender(<AnimeWatchScreen detail={detail} episode={1} nextHref="/watch/anime/21?episode=2" />)
  expect(screen.getByText('Playback audio: en')).toBeInTheDocument()
  expect(mocks.patch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('radio', { name: 'SUB' }))
  expect(mocks.patch).toHaveBeenCalledWith({ animeAudio: 'sub' })
  expect(mocks.push).toHaveBeenCalledWith('/watch/anime/21?episode=1&audio=sub')
})
it('honors an explicit SUB URL for this visit without changing the saved DUB preference', () => {
  render(<AnimeWatchScreen detail={detail} episode={1} nextHref="/watch/anime/21?episode=2" audio="sub" />)
  expect(screen.getByText('Playback audio: ja')).toBeInTheDocument()
  expect(mocks.patch).not.toHaveBeenCalled()
})
