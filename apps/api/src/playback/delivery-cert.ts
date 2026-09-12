import { isPlausibleManifestDuration, parseHlsReferenceEntries, sumMediaPlaylistDuration } from './hls.ts'
import type { MediaTransport } from './transport.ts'

/**
 * Certification checks (ADR-0002 Amendment C, slice B).
 *
 * "Resolves + first segment loads" is not enough to declare a provider
 * DIRECT_CERTIFIED. These checks prove the content is the right title at the
 * right position with a usable lifetime, using only bounded fetches. Every
 * check returns null (unknown) instead of failing where evidence is absent,
 * and async checks never throw — a failed check is data, not an exception.
 */

export type CertVerdict = { pass: boolean | null; detail?: string | undefined }

/** Wrong-title/wrong-episode guard: a 3-minute clip must never certify as a
 *  2-hour film or a 45-minute episode. Null plausibility means no expectation
 *  (no runtime) or no timeline (master playlists) — unknown, not failed. */
export function certifyTimeline(manifestText: string, expectedRuntimeSec: number | undefined): {
  durationSec: number | undefined
  plausible: boolean | null
} {
  let durationSec: number | undefined
  try {
    if (!manifestText.trimStart().startsWith('#EXTM3U')) return { durationSec: undefined, plausible: false }
    durationSec = sumMediaPlaylistDuration(manifestText)
  } catch {
    return { durationSec: undefined, plausible: false }
  }
  if (durationSec === undefined || expectedRuntimeSec === undefined) {
    return { durationSec, plausible: null }
  }
  return { durationSec, plausible: isPlausibleManifestDuration(durationSec, expectedRuntimeSec) }
}

const SEEK_BYTES = 65535
const SEEK_DRAIN_LIMIT = 65536

/**
 * Prove one URL serves bytes at all: a 64KB range probe accepted as 200 or
 * 206 with a playable content type. Destroys the body early so a range-
 * ignoring upstream cannot bill a full segment download.
 */
export async function probeSeekSupport(
  url: string,
  hosts: readonly string[],
  transport: MediaTransport,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const response = await transport(url, hosts, {
      'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/150 Safari/537.36',
      accept: '*/*',
      Range: `bytes=0-${SEEK_BYTES}`,
    }, signal)
    try {
      if (response.status !== 200 && response.status !== 206) return false
      const contentType = response.headers.get('content-type') ?? ''
      if (!/^(?:video\/|audio\/|application\/(?:octet-stream|mp4))/i.test(contentType)) return false
      let size = 0
      for await (const chunk of response.body) {
        size += (chunk as Uint8Array).length
        if (size > SEEK_DRAIN_LIMIT) break
      }
      return size > 0
    } finally {
      response.body.destroy()
    }
  } catch {
    return false
  }
}

/**
 * Seek certification for one variant playlist text: probe the segments near
 * 50% and 95% of the timeline. Catches truncated/placeholder manifests whose
 * first chunk loads but the rest of the film is missing. Positions with no
 * servable segment report null (unknown).
 */
export async function certifyVariantSeek(
  variantText: string,
  baseUrl: string,
  hosts: readonly string[],
  transport: MediaTransport,
  signal: AbortSignal,
): Promise<{ seek50: boolean | null; seek95: boolean | null }> {
  let segments: string[] = []
  try {
    segments = parseHlsReferenceEntries(variantText, baseUrl)
      .filter((entry) => entry.media)
      .map((entry) => entry.url)
  } catch {
    return { seek50: null, seek95: null }
  }
  if (!segments.length) return { seek50: null, seek95: null }
  const at = async (fraction: number): Promise<boolean | null> => {
    const url = segments[Math.min(segments.length - 1, Math.floor(segments.length * fraction))]!
    try {
      return await probeSeekSupport(url, hosts, transport, signal)
    } catch {
      return null
    }
  }
  const [seek50, seek95] = await Promise.all([at(0.5), at(0.95)])
  return { seek50, seek95 }
}

/** Source-lifetime check: short-lived signed URLs must clear a freshness
 *  floor well above resolve-to-first-byte time, or the player expires
 *  mid-watch. The 4-minute default sits under the standard 5-minute upstream
 *  grant; unparseable dates fail. */
export function certifyExpiry(expiresAt: string, now: number = Date.now(), minHorizonSec = 240): {
  horizonSec: number | undefined
  fresh: boolean
} {
  const horizonSec = Math.floor((Date.parse(expiresAt) - now) / 1000)
  if (!Number.isFinite(horizonSec)) return { horizonSec: undefined, fresh: false }
  return { horizonSec, fresh: horizonSec >= minHorizonSec }
}
