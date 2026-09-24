import { describe, expect, it } from 'vitest'

import { parseEmbedQuery } from './embed-query'

describe('parseEmbedQuery', () => {
  it('defaults to autoplay at the start of the title', () => {
    expect(parseEmbedQuery({})).toEqual({ autoPlay: true, lang: undefined, startAt: 0 })
  })

  it('disables autoplay for false and 0', () => {
    expect(parseEmbedQuery({ autoplay: 'false' }).autoPlay).toBe(false)
    expect(parseEmbedQuery({ autoplay: '0' }).autoPlay).toBe(false)
    expect(parseEmbedQuery({ autoplay: 'true' }).autoPlay).toBe(true)
    expect(parseEmbedQuery({ autoplay: ['false', 'true'] }).autoPlay).toBe(false)
  })

  it('accepts a whole-second startAt and clamps junk', () => {
    expect(parseEmbedQuery({ startAt: '60' }).startAt).toBe(60)
    expect(parseEmbedQuery({ startAt: '60.9' }).startAt).toBe(60)
    expect(parseEmbedQuery({ startAt: '-5' }).startAt).toBe(0)
    expect(parseEmbedQuery({ startAt: 'soon' }).startAt).toBe(0)
    expect(parseEmbedQuery({ startAt: String(30 * 24 * 60 * 60) }).startAt).toBe(7 * 24 * 60 * 60)
  })

  it('keeps only safe language tags', () => {
    expect(parseEmbedQuery({ lang: 'it' }).lang).toBe('it')
    expect(parseEmbedQuery({ lang: 'pt-BR' }).lang).toBe('pt-br')
    expect(parseEmbedQuery({ lang: 'en-US' }).lang).toBe('en-us')
    expect(parseEmbedQuery({ lang: '../../etc' }).lang).toBeUndefined()
    expect(parseEmbedQuery({ lang: 'not a lang!!' }).lang).toBeUndefined()
    expect(parseEmbedQuery({ lang: 'x'.repeat(17) }).lang).toBeUndefined()
  })
})
