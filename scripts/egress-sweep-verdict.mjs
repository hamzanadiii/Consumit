// Pure verdict logic for the egress sweep. No I/O, no imports: this is the
// part of the matrix that must be deterministic and unit-tested.
//
// A sweep report carries one `label` per egress (dev line, OVH, a Cloudflare
// resolver colo). Each report measures the same providers through that egress.
// `joinReports` merges them and decides, per provider, whether browser-direct
// playback in production is possible, blocked, or simply untested.

/** Ordered so the matrix reads best-case first. */
export const VERDICT_ORDER = [
  'direct',
  'cors-blocked',
  'header-bound',
  'origin-bound',
  'decode-blocked',
  'lookup-egress-bound',
  'media-egress-bound',
  'media-blocked',
  'embed-class',
  'unresolved',
  'unmeasured',
  'partial',
  'viewer-untested',
  'unknown',
]

export const VERDICT_LABEL = {
  'direct': 'Direct possible',
  'cors-blocked': 'CORS blocked',
  'header-bound': 'Needs browser-forbidden headers',
  'origin-bound': 'Consumit origin refused',
  'decode-blocked': 'No first frame',
  'lookup-egress-bound': 'Lookup egress bound',
  'media-egress-bound': 'Media egress bound',
  'media-blocked': 'Media blocked everywhere',
  'embed-class': 'Embed class',
  'unresolved': 'Never resolves',
  'unmeasured': 'Lookup unmeasured (catalog metadata unavailable)',
  'partial': 'Partially measured',
  'viewer-untested': 'Viewer egress untested',
  'unknown': 'Indeterminate',
}

const bool = (value) => value === true || value === false ? value : null

/** Collapse one report's probes for a provider into a single measurement. */
export function aggregate(provider) {
  const probes = Array.isArray(provider?.probes) ? provider.probes : []
  const resolve = probes.map((probe) => bool(probe.resolveOk))
  const media = probes.map((probe) => bool(probe.mediaOk))
  const mediaWithHeaders = probes.map((probe) => bool(probe.mediaWithHeadersOk))
  const mediaNoOrigin = probes.map((probe) => bool(probe.mediaNoOriginOk))
  const cors = probes.map((probe) => bool(probe.cors))
  const browser = probes.map((probe) => bool(probe.browserOk))
  const any = (values) => values.includes(true) ? true : values.includes(false) ? false : null
  return {
    resolveOk: any(resolve),
    mediaOk: any(media),
    mediaWithHeadersOk: any(mediaWithHeaders),
    mediaNoOriginOk: any(mediaNoOrigin),
    cors: any(cors),
    browserOk: any(browser),
    // `null` means the browser never ran for this provider, which must not be
    // mistaken for a measured failure.
    browserRun: browser.some((value) => value !== null),
    codes: [...new Set(probes.map((probe) => probe.resolveCode).filter((code) => typeof code === 'string' && code))],
  }
}

/**
 * Classify one provider from the viewer egress's measurement plus every other
 * tested egress. `viewer` is the label that stands in for the end user.
 */
export function classify(measurements, viewer) {
  const current = measurements[viewer]
  if (!current) return { verdict: 'viewer-untested', needsEgress: [], blockers: [] }

  const labels = Object.keys(measurements)
  const resolvedElsewhere = labels.filter((label) => label !== viewer && measurements[label].resolveOk === true)
  const mediaElsewhere = labels.filter((label) => label !== viewer && measurements[label].mediaOk === true)

  if (current.browserOk === true) return { verdict: 'direct', needsEgress: [], blockers: [] }

  if (current.resolveOk === false) {
    if (resolvedElsewhere.length) {
      return { verdict: 'lookup-egress-bound', needsEgress: resolvedElsewhere, blockers: ['lookup succeeds elsewhere but not from the viewer egress'] }
    }
    // A failed lookup that only ran without its catalog metadata says nothing
    // about the provider; calling it "never resolves" would be a false verdict.
    if (current.codes.length > 0 && current.codes.every((code) => code === 'metadata-unavailable')) {
      return { verdict: 'unmeasured', needsEgress: [], blockers: ['anime lookup needs catalog metadata that was unavailable during this run'] }
    }
    return { verdict: 'unresolved', needsEgress: [], blockers: ['no tested egress resolved a source'] }
  }

  if (current.mediaOk === false) {
    // The bare request is what a browser actually sends. If the adapter's own
    // header hints are what make it succeed, no browser can reproduce that.
    if (current.mediaWithHeadersOk === true) {
      return { verdict: 'header-bound', needsEgress: [], blockers: ['media answers only with request headers the browser is not allowed to set'] }
    }
    // Same adapter headers, minus the Origin a browser must always send: if
    // that alone fixes it, the provider is refusing the Consumit origin.
    if (current.mediaNoOriginOk === true) {
      return { verdict: 'origin-bound', needsEgress: [], blockers: ['provider refuses the Consumit origin; only a provider allowlist entry makes this playable in a browser'] }
    }
    if (mediaElsewhere.length) {
      return { verdict: 'media-egress-bound', needsEgress: mediaElsewhere, blockers: ['media rejects the viewer egress; URL is bound to another egress'] }
    }
    if (current.resolveOk === true) {
      return { verdict: 'media-blocked', needsEgress: [], blockers: ['source resolved but media failed from every tested egress'] }
    }
    return { verdict: 'partial', needsEgress: [], blockers: ['media was not measured'] }
  }

  if (current.mediaOk === true && current.cors === false) {
    return { verdict: 'cors-blocked', needsEgress: [], blockers: ['media answers this egress but does not expose it to the browser origin'] }
  }

  if (current.mediaOk === true && current.browserOk === false) {
    return { verdict: 'decode-blocked', needsEgress: [], blockers: ['media is fetchable and CORS-readable but produced no first frame'] }
  }

  if (current.mediaOk === null || current.browserOk === null || current.resolveOk === null) {
    return { verdict: 'partial', needsEgress: [], blockers: ['some checks did not run'] }
  }

  return { verdict: 'unknown', needsEgress: [], blockers: ['measurements are contradictory'] }
}

/**
 * Merge sweep reports into matrix rows.
 * @param {Array<object>} reports per-egress reports produced by the runner
 * @param {string} [viewerLabel] label standing in for the end user; defaults
 *   to the first report that actually ran a browser check
 */
export function joinReports(reports, viewerLabel) {
  const usable = reports.filter((report) => Array.isArray(report?.providers) && typeof report.label === 'string')
  if (!usable.length) throw new Error('No sweep reports to join.')

  const byLabel = new Map()
  const order = []
  for (const report of usable) {
    if (byLabel.has(report.label)) throw new Error(`Duplicate sweep label "${report.label}".`)
    byLabel.set(report.label, report)
    order.push(report.label)
  }

  const viewer = viewerLabel
    ?? usable.find((report) => report.providers.some((provider) => aggregate(provider).browserRun))?.label
    ?? order[order.length - 1]
  if (!byLabel.has(viewer)) throw new Error(`Viewer label "${viewer}" is not among the sweep reports.`)

  const ids = []
  const seen = new Set()
  for (const report of usable) {
    for (const provider of report.providers) {
      if (!seen.has(provider.id)) { seen.add(provider.id); ids.push(provider.id) }
    }
  }

  return ids.map((id) => {
    const measurements = {}
    let delivery
    let adapter
    for (const label of order) {
      const provider = byLabel.get(label).providers.find((entry) => entry.id === id)
      if (!provider) continue
      delivery = delivery ?? provider.delivery ?? 'direct'
      adapter = adapter ?? provider.adapter
      measurements[label] = aggregate(provider)
    }
    const codes = [...new Set(Object.values(measurements).flatMap((entry) => entry.codes))]
    // Embed rows play inside the provider's own player, so media/CORS probes
    // say nothing about them; the configured tier is the whole answer.
    if ((delivery ?? 'direct') === 'embed') {
      return { id, adapter, delivery: 'embed', viewer, measurements, verdict: 'embed-class', needsEgress: [], blockers: ['plays inside the provider player; not a direct-delivery candidate'], codes }
    }
    const { verdict, needsEgress, blockers } = classify(measurements, viewer)
    return { id, adapter, delivery: delivery ?? 'direct', viewer, measurements, verdict, needsEgress, blockers, codes }
  })
}

export function summarize(rows) {
  const counts = Object.fromEntries(VERDICT_ORDER.map((verdict) => [verdict, 0]))
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1
  return {
    providers: rows.length,
    directPossible: counts['direct'] ?? 0,
    fixable: (counts['cors-blocked'] ?? 0) + (counts['decode-blocked'] ?? 0) + (counts['lookup-egress-bound'] ?? 0),
    bound: (counts['media-egress-bound'] ?? 0) + (counts['media-blocked'] ?? 0),
    counts,
  }
}

export function renderMatrix(rows) {
  const sorted = [...rows].sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) || a.id.localeCompare(b.id))
  const header = '| Provider | Configured tier | Verdict | Needs egress | Blocker | Evidence |'
  const rule = '|---|---|---|---|---|---|'
  const body = sorted.map((row) => {
    const needs = row.needsEgress.length ? row.needsEgress.join(', ') : '—'
    const blocker = row.blockers.length ? row.blockers.join('; ') : '—'
    const evidence = row.codes.length ? row.codes.join(', ') : '—'
    const cell = (value) => String(value).replace(/\|/g, '\\|')
    return `| ${cell(row.id)} | ${cell(row.delivery)} | ${cell(VERDICT_LABEL[row.verdict] ?? row.verdict)} | ${cell(needs)} | ${cell(blocker)} | ${cell(evidence)} |`
  })
  return [header, rule, ...body].join('\n')
}
