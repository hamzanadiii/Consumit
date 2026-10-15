import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsumitPlayer } from './consumit-player'

afterEach(() => localStorage.clear())
it.each([false, true])('enables saved Arabic after discovery with bundled English=%s', async (bundledEnglish) => {
  const candidate = { id: 'arabic', label: 'Arabic', language: 'ar', provider: 'fixture' }
  const page = vi.fn().mockResolvedValue({ tracks: [candidate], total: 1, nextCursor: null })
  const prepare = vi.fn().mockResolvedValue({ ...candidate, url: 'https://media.example/arabic.vtt', cues: [{ startTime: 0, endTime: 30, text: 'ترجمة' }] })
  const props = { title: 'Saved Arabic then English', source: { type: 'native' as const, src: 'https://media.example/movie.mp4', subtitles: bundledEnglish ? [{ id: 'english', label: 'English', language: 'en', url: 'https://media.example/english.vtt' }] : [] }, initialViewingPreferences: { audioLanguage: 'en', qualityHeight: null, subtitlesEnabled: true, subtitleLanguages: ['ar', 'en'] }, onSubtitlePage: page, onSubtitleCandidateSelect: prepare }
  const view = render(<ConsumitPlayer {...props} subtitleDiscovery={{ languages: [], providers: [], loading: true, error: null }} />)
  view.rerender(<ConsumitPlayer {...props} subtitleDiscovery={{ languages: [{ code: 'ar', count: 1 }], providers: [], loading: false, error: null }} />)
  await waitFor(() => expect(prepare).toHaveBeenCalledWith(candidate))
  // The same caption control reports the selection the member sees.
  fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
  await waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'Off' })).toHaveAttribute('aria-checked', 'false'))
  fireEvent.click(screen.getByRole('button', { name: /العربية/ }))
  await waitFor(() => expect(screen.getByRole('menuitemradio', { name: /العربية/ })).toHaveAttribute('aria-checked', 'true'))
})
