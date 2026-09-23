import type { ServedSubtitle } from './engine.ts'
import type { SubtitleService } from './subtitles.ts'
import { shiftVtt } from './sync.ts'

const CANNED_VTT = 'WEBVTT\n\n00:00.000 --> 00:04.000\nHello from the fixture.\n'

/** Deterministic fake for tests and web fixtures. Search returns two stable
 *  tracks (one served file, one direct); only the canned file key exists. */
export const FAKE_SERVED_FILE_KEY = 'abcdef0123456789'

export function createFakeSubtitleService(): SubtitleService {
  return {
    async search(): Promise<ServedSubtitle[]> {
      return [
        {
          id: 'sub-yify-test',
          label: 'English (yify)',
          language: 'en',
          url: `https://api.example/v1/subtitles/file/${FAKE_SERVED_FILE_KEY}`,
          format: 'vtt',
          provider: 'yify',
        },
        {
          id: 'sub-castlesubs-d-1',
          label: 'English (castlesubs)',
          language: 'en',
          url: 'https://cdn.example/subs/en.vtt',
          format: 'vtt',
          provider: 'castlesubs',
        },
      ]
    },
    async file(key: string, offsetMs?: number | undefined): Promise<string | null> {
      if (key !== FAKE_SERVED_FILE_KEY) return null
      if (!offsetMs) return CANNED_VTT
      return shiftVtt(CANNED_VTT, offsetMs)
    },
    async original(): Promise<null> {
      return null
    },
  }
}
