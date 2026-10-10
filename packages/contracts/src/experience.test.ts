import { describe, expect, it } from 'vitest'
import { experiencePatchSchema, defaultExperiencePreferences } from './experience'
describe('semantic experience contracts', () => {
  it('does not fill defaults into patches or accept an empty mutation', () => {
    expect(experiencePatchSchema.parse({ guideStatus: 'dismissed', guideVersion: 1 })).toEqual({ guideStatus: 'dismissed', guideVersion: 1 })
    expect(experiencePatchSchema.safeParse({}).success).toBe(false)
    expect(defaultExperiencePreferences()).toMatchObject({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: true, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false })
  })
  it('rejects duplicate, excess and malformed languages, unknown fields, and track identifiers', () => {
    for (const input of [{ subtitleLanguages: ['en', 'en'] }, { subtitleLanguages: ['en', 'ar', 'fr', 'es'] }, { audioLanguage: 'Audio track 2' }, { subtitleTrackId: 'source-1' }, { qualityHeight: 4321 }, { guideVersion: 2 }]) expect(experiencePatchSchema.safeParse(input).success).toBe(false)
  })
})
