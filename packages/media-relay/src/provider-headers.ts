/** Recorded hints for reviewed split-host segment recipes.
 * Every destination must still pass the independent edge policy.
 * Other providers retain their original-host header scope, except the
 * reviewed Vidnest-family proxy rows below: their upstream API issues one
 * public Referer/Origin pair (nextgencloudfabric.com) that applies to every
 * approved media host for that provider (remoteconsultinggroup.site,
 * cache.vdrk.site, …). Stripping it on nested-variant/segment hops turns
 * healthy manifests into edge 403s surfaced as `headers` browser failures.
 * Only vetted hints reach here (see relay permits). The original-host branch
 * returns them unchanged, including the sole reviewed NontonFlix media cookie;
 * no credential is forwarded across a host change. */
export function mediaHeaders(provider: string, host: string, headerHost: string, hints: Record<string, string>, recipe?: string) {
  if (host === headerHost) return hints
  if (provider === 'vidbolt' && hints.origin === 'https://vidbolt.xyz'
      && ['img.rousav.tech', 'img.animecurx.tech', 'proxy.vidbolt.xyz'].includes(host)) {
    return { origin: 'https://vidbolt.xyz' }
  }
  if (provider === 'zoko' && headerHost === 'hls.dramahot.top' && host === 'hls1.drama1.cfd') {
    return { referer: 'https://zokoanime.video/', origin: 'https://zokoanime.video' }
  }
  if (['wecollege-miami', 'wecollege-boise'].includes(provider)
      && ['moon.zenoak.top', 'moon.goldenkite.top'].includes(headerHost)
      && (recipe === 'wecollege-city-v1' || ['ultramoss.top', 'emberwave.top', 'rapidmesa.top'].includes(host))) {
    return { referer: 'https://movy.sx/' }
  }
  if (provider === 'stormboron' && recipe === 'storm-boron-v1') return { referer: 'https://vidstorm.to/' }
  if (provider === 'aether' && recipe === 'aether-v1') {
    // tnmr binds its signed master to the UA that followed the LUL worker
    // 302; replaying that exact UA on every hop is the only way the edge
    // accepts the grant. Strip everything else.
    const userAgent = hints['user-agent']
    return {
      ...(typeof userAgent === 'string' && userAgent.length <= 512 && !/[\r\n]/.test(userAgent) ? { 'user-agent': userAgent } : {}),
    }
  }
  if (provider === 'cno' && headerHost === 'cno.to' && hints.referer === 'https://cno.to/'
      && ['v.prismdesk.top', 'v.lumenbox.top', 'v.neonvase.top', 'v.starlantern.top', 'v.haloshade.top', 'v.sparkwick.top'].includes(host)) {
    return { referer: 'https://cno.to/' }
  }
  if (provider === 'zenox' && headerHost === 'zenox.lol' && hints.referer === 'https://zenox.lol/'
      && ['bub.zenox.lol', 'r10.zenox.lol'].includes(host)) {
    const userAgent = hints['user-agent']
    return {
      referer: 'https://zenox.lol/',
      ...(typeof userAgent === 'string' && userAgent.length <= 512 && !/[\r\n]/.test(userAgent) ? { 'user-agent': userAgent } : {}),
    }
  }
  if (provider === 'aphrodite' && hints.referer === 'https://atlantic.st/') return { referer: hints.referer }
  if (provider === 'aniclover' && hints.referer === 'https://aniclover.cc/'
      && (!hints.origin || hints.origin === 'https://aniclover.cc')) {
    return { referer: 'https://aniclover.cc/', origin: 'https://aniclover.cc' }
  }
  if (provider === 'mapple') {
    // Mapple's CDN binds masters to its own Origin/Referer and a non-Chrome
    // UA; nested variants and segments need the same reviewed pair.
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(hints)) {
      const key = name.toLowerCase()
      if (!['referer', 'origin', 'user-agent', 'accept'].includes(key)) continue
      if (typeof value !== 'string' || !value || value.length > 512 || /[\r\n]/.test(value)) continue
      if (key === 'origin') {
        try {
          out[key] = new URL(value).origin
        } catch {
          continue
        }
      } else {
        out[key] = value
      }
    }
    return out
  }
  if (provider === 'justanime') {
    const userAgent = hints['user-agent']
    return {
      referer: 'https://justanime.to/', origin: 'https://justanime.to',
      ...(typeof userAgent === 'string' && userAgent.length <= 512 && !/[\r\n]/.test(userAgent) ? { 'user-agent': userAgent } : {}),
    }
  }
  if (['vidnest', 'vaplayer', 'zeta', 'animedex'].includes(provider)) {
    const out: Record<string, string> = {}
    // Preserve the adapter-recorded public hints; drop anything unexpected.
    for (const [name, value] of Object.entries(hints)) {
      const key = name.toLowerCase()
      if (!['referer', 'origin', 'user-agent', 'accept'].includes(key)) continue
      if (typeof value !== 'string' || !value || value.length > 512 || /[\r\n]/.test(value)) continue
      if (key === 'origin') {
        try {
          out[key] = new URL(value).origin
        } catch {
          continue
        }
      } else {
        out[key] = value
      }
    }
    return out
  }
  return {}
}
