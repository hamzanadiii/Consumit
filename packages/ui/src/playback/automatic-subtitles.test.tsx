import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsumitPlayer } from './consumit-player'

afterEach(() => localStorage.clear())
it.each([false, true])('enables saved Arabic after discovery with bundled English=%s', async (bundledEnglish) => {
  const candidate = { id: 'arabic', label: 'Arabic', language: 'ar', provider: 'fixture', match: 'source' as const }
  const page = vi.fn().mockResolvedValue({ tracks: [candidate], total: 1, nextCursor: null })
  const prepare = vi.fn().mockResolvedValue({ ...candidate, url: 'https://media.example/arabic.vtt', cues: [{ startTime: 0, endTime: 30, text: 'ترجمة' }] })
  const props = {
    title: 'Saved Arabic then English',
    media: { source: { type: 'native' as const, src: 'https://media.example/movie.mp4', subtitles: bundledEnglish ? [{ id: 'english', label: 'English', language: 'en', url: 'https://media.example/english.vtt' }] : [] } },
    controls: {
      preferences: { initialViewing: { audioLanguage: 'en', qualityHeight: null, subtitlesEnabled: true, subtitleLanguages: ['ar', 'en'] } },
      captions: { page, prepare },
    },
  }
  const view = render(<ConsumitPlayer {...props} controls={{ ...props.controls, captions: { ...props.controls.captions, discovery: { languages: [], providers: [], loading: true, error: null } } }} />)
  view.rerender(<ConsumitPlayer {...props} controls={{ ...props.controls, captions: { ...props.controls.captions, discovery: { languages: [{ code: 'ar', count: 1 }], providers: [], loading: false, error: null } } }} />)
  await waitFor(() => expect(prepare).toHaveBeenCalledWith(candidate))
  // The same caption control reports the selection the member sees.
  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'false'))
  fireEvent.click(screen.getByRole('button', { name: /العربية/ }))
  await waitFor(() => expect(screen.getByRole('radio', { name: /العربية/ })).toHaveAttribute('aria-checked', 'true'))
})

it('tries another track in the same language when a selected provider file is stale', async () => {
  const broken = { id: 'broken', label: 'English stale copy', language: 'en', provider: 'provider-a', providerName: 'Provider A', release: 'stale release' }
  const available = { id: 'available', label: 'English working copy', language: 'en', provider: 'provider-b', match: 'release' as const, providerName: 'Provider B', release: 'working release' }
  const page = vi.fn().mockResolvedValue({ tracks: [broken, available], total: 2, nextCursor: null })
  const prepare = vi.fn(async (candidate: { id: string }) => {
    if (candidate.id === broken.id) throw new Error('upstream subtitle expired')
    return { ...available, url: 'https://media.example/english.vtt', cues: [{ startTime: 0, endTime: 30, text: 'Hello' }] }
  })
  render(<ConsumitPlayer
    title="Provider recovery"
    media={{ source: { type: 'native', src: 'https://media.example/movie.mp4', subtitles: [] } }}
    controls={{ captions: { discovery: { searchId: 'subtitle-search', languages: [{ code: 'en', count: 2 }], providers: [], loading: false, error: null }, page, prepare } }}
  />)

  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  fireEvent.click(screen.getByRole('button', { name: /English/ }))
  await waitFor(() => expect(page).toHaveBeenCalledWith('en', 0))
  fireEvent.click(await screen.findByRole('button', { name: /stale release/ }))
  await waitFor(() => expect(prepare).toHaveBeenNthCalledWith(2, available))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('automatically tries an available subtitle even when its match is unverified', async () => {
  const candidate = { id: 'uncertain', label: 'English backup', language: 'en', provider: 'fixture', match: 'unverified' as const }
  const page = vi.fn(async () => ({ tracks: [candidate], total: 1, nextCursor: null }))
  const prepare = vi.fn(async () => ({ ...candidate, url: 'https://media.example/english.vtt', cues: [{ startTime: 0, endTime: 30, text: 'Hello' }] }))
  render(<ConsumitPlayer title="Uncertain release" media={{ source: { type: 'native', src: 'https://media.example/movie.mp4', subtitles: [] } }} controls={{ preferences: { initialViewing: { audioLanguage: 'en', qualityHeight: null, subtitlesEnabled: true, subtitleLanguages: ['en'] } }, captions: { discovery: { languages: [{ code: 'en', count: 1 }], providers: [], loading: false, error: null }, page, prepare } }} />)
  await waitFor(() => expect(page).toHaveBeenCalled())
  await waitFor(() => expect(prepare).toHaveBeenCalledWith(candidate))
  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'false'))
})

it('announces partial subtitle-provider availability when discovery completes', () => {
  const message = 'Some tracks are unavailable. You can still choose from the available tracks.'
  render(<ConsumitPlayer
    title="Partial subtitle discovery"
    media={{ source: { type: 'native', src: 'https://media.example/movie.mp4', subtitles: [] } }}
    controls={{ captions: { discovery: {
      languages: [{ code: 'en', count: 2 }],
      providers: [{ id: 'fixture', name: 'Fixture provider', state: 'failed', durationMs: 5, found: 0 }],
      loading: false,
      error: null,
    } } }}
  />)

  fireEvent.click(screen.getByRole('button', { name: 'Captions' }))
  expect(screen.getByText(message)).toHaveAttribute('role', 'status')
})
