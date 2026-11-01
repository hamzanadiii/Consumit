import { describe, expect, it } from 'vitest'
import { mediaHeaders } from './provider-headers.ts'

describe('provider media header forwarding', () => {
  it('keeps VidBolt’s fixed Origin on its reviewed media hosts across HLS hops', () => {
    for (const host of ['img.rousav.tech', 'img.animecurx.tech', 'proxy.vidbolt.xyz']) {
      expect(mediaHeaders('vidbolt', host, 'img.rousav.tech', { origin: 'https://vidbolt.xyz' })).toEqual({ origin: 'https://vidbolt.xyz' })
    }
  })

  it('does not forward VidBolt hints to other hosts or arbitrary origins', () => {
    expect(mediaHeaders('vidbolt', 'outside.example', 'img.rousav.tech', { origin: 'https://vidbolt.xyz' })).toEqual({})
    expect(mediaHeaders('vidbolt', 'proxy.vidbolt.xyz', 'img.rousav.tech', { origin: 'https://outside.example' })).toEqual({})
  })

  it('keeps the NontonFlix device cookie on its media host and drops it everywhere else', () => {
    const hints = { cookie: 'nf_mk=device; nf_web=web', referer: 'https://nontonflix.com/' }
    expect(mediaHeaders('nontonflix', 'media.nontonflix.com', 'media.nontonflix.com', hints)).toEqual(hints)
    expect(mediaHeaders('nontonflix', 'outside.example', 'media.nontonflix.com', hints)).toEqual({})
  })

  it('keeps the WeCollege movy.sx Referer on nested hosts from either reviewed master host', () => {
    const hints = { referer: 'https://movy.sx/', origin: 'https://movy.sx' }
    for (const headerHost of ['moon.zenoak.top', 'moon.goldenkite.top']) {
      expect(mediaHeaders('wecollege-miami', 'ultramoss.top', headerHost, hints, 'wecollege-city-v1')).toEqual({ referer: 'https://movy.sx/' })
      expect(mediaHeaders('wecollege-boise', 'emberwave.top', headerHost, hints, 'wecollege-city-v1')).toEqual({ referer: 'https://movy.sx/' })
    }
    // Without the reviewed recipe, only the approved nested hosts keep it.
    expect(mediaHeaders('wecollege-miami', 'ultramoss.top', 'moon.goldenkite.top', hints)).toEqual({ referer: 'https://movy.sx/' })
    // With the recipe, any host inside the edge-gated discovery graph keeps it.
    expect(mediaHeaders('wecollege-miami', 'dynamic-title.example', 'moon.goldenkite.top', hints, 'wecollege-city-v1')).toEqual({ referer: 'https://movy.sx/' })
    // An unreviewed master host never earns the recipe.
    expect(mediaHeaders('wecollege-miami', 'ultramoss.top', 'other-master.example', hints, 'wecollege-city-v1')).toEqual({})
  })

  it('keeps Mapple’s reviewed Origin, Referer, and non-Chrome UA across its CDN graph', () => {
    const hints = {
      origin: 'https://mapple.fun',
      referer: 'https://mapple.fun/',
      'user-agent': 'node',
      accept: '*/*',
      cookie: '_mapple_site=secret',
    }
    expect(mediaHeaders('mapple', 'source.jordanblackwell.bid', 'source.jordanblackwell.bid', hints)).toEqual(hints)
    expect(mediaHeaders('mapple', 'proxy2.jordanblackwell.bid', 'source.jordanblackwell.bid', hints)).toEqual({
      origin: 'https://mapple.fun',
      referer: 'https://mapple.fun/',
      'user-agent': 'node',
      accept: '*/*',
    })
  })
})
