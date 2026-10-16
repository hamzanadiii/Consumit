import { describe, expect, it } from 'vitest'
import { audioMenuOptions } from './audio-menu'

describe('unified audio choices', () => {
  it('merges ISO aliases, numbered labels and multiple providers while retaining delivery IDs', () => {
    const options = audioMenuOptions([{ value: '0', label: '1. English', language: 'eng' }, { value: '1', label: 'English' }], [{ id: 'en', label: 'English', language: 'en', provider: 'Apogee' }, { id: 'hi', label: '2. Hindi', language: 'hin', provider: 'Apogee' }, { id: 'hi2', label: 'Hindi', language: 'hi', provider: 'Other' }])
    expect(options.map(o => o.label)).toEqual(['English', 'Hindi'])
    expect(options[0]?.stream.map(t => t.value)).toEqual(['0', '1'])
    expect(options[0]?.separate.map(t => t.id)).toEqual(['en'])
    expect(options[1]?.separate.map(t => t.id)).toEqual(['hi', 'hi2'])
  })
  it('preserves known regional and accessibility variants without exposing provider labels', () => {
    const options = audioMenuOptions([{ value: '0', label: 'English', language: 'en' }, { value: '1', label: 'English audio description', language: 'en' }], [{ id: 'es', label: 'Apogee Spanish', language: 'es-419', provider: 'Apogee' }, { id: 'es2', label: 'Spanish', language: 'es-ES', provider: 'Other' }])
    expect(options.map(o => o.label)).toEqual(['English', 'English · Audio description', 'European Spanish', 'Latin American Spanish'])
  })
  it('keeps unidentified audio distinct instead of guessing its language', () => {
    expect(audioMenuOptions([{ value: '0', label: 'Original' }, { value: '1', label: 'Main audio', language: 'und' }], []).map(o => o.label)).toEqual(['Main audio', 'Original'])
  })
})
