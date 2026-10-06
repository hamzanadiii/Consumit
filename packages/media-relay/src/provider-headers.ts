/** Recorded, noncredential hints for reviewed split-host segment recipes.
 * Every destination must still pass the independent edge policy.
 * Other providers retain their original-host header scope, except the
 * reviewed Vidnest-family proxy rows below: their upstream API issues one
 * public Referer/Origin pair (nextgencloudfabric.com) that applies to every
 * approved media host for that provider (remoteconsultinggroup.site,
 * cache.vdrk.site, …). Stripping it on nested-variant/segment hops turns
 * healthy manifests into edge 403s surfaced as `headers` browser failures.
 * Only vetted non-credential hints ever reach here (see relay permits). */
export function mediaHeaders(provider: string, host: string, headerHost: string, hints: Record<string, string>, recipe?: string) {
  if (host === headerHost) return hints
  if (provider === 'zoko' && headerHost === 'hls.dramahot.top' && host === 'hls1.drama1.cfd') {
    return { referer: 'https://zokoanime.video/', origin: 'https://zokoanime.video' }
  }
  if (['wecollege-miami', 'wecollege-boise'].includes(provider) && headerHost === 'moon.zenoak.top'
      && (recipe === 'wecollege-city-v1' || ['ultramoss.top', 'emberwave.top', 'rapidmesa.top'].includes(host))) {
    return { referer: 'https://movy.sx/' }
  }
  if (provider === 'stormboron' && recipe === 'storm-boron-v1') return { referer: 'https://vidstorm.to/' }
  if (['vidnest', 'vaplayer', 'zeta'].includes(provider)) {
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
