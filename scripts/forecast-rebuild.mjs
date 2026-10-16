import { pathToFileURL } from 'node:url'
export function forecast({ ordinaryDaily = 4000000, ordinaryPeakRps = 500, watchesDaily = 20000, watchSeconds = 3600, simultaneousWatches = 5000, progressSeconds = 25, bitrateMbps = 3, relayFraction = 0.1, segmentSeconds = 6 } = {}) {
  const values = [ordinaryDaily, ordinaryPeakRps, watchesDaily, watchSeconds, simultaneousWatches, progressSeconds, bitrateMbps, segmentSeconds]
  if (values.some(value => !Number.isFinite(value) || value <= 0) || !Number.isFinite(relayFraction) || relayFraction < 0 || relayFraction > 1) throw new Error('Use positive finite planning assumptions and a relay fraction from zero to one.')
  return {
    assumptions: { ordinaryDaily, ordinaryPeakRps, watchesDaily, watchSeconds, simultaneousWatches, progressSeconds, bitrateMbps, relayFraction, segmentSeconds },
    ordinaryAverageRps: ordinaryDaily / 86400,
    averageSimultaneousWatches: watchesDaily * watchSeconds / 86400,
    periodicProgressDaily: watchesDaily * watchSeconds / progressSeconds,
    periodicProgressPeakRps: simultaneousWatches / progressSeconds,
    combinedPeakProductRps: ordinaryPeakRps + simultaneousWatches / progressSeconds,
    relayPeakMbps: simultaneousWatches * bitrateMbps * relayFraction,
    relayDailyGB: watchesDaily * watchSeconds * bitrateMbps / 8000 * relayFraction,
    relayPeakSegmentRps: simultaneousWatches / segmentSeconds * relayFraction,
    limitations: 'Assumptions, not measured capacity. Progress excludes pause, seek, completion and exit writes. Relay estimates exclude manifests, retries, subtitles and bitrate variation. No paid delivery price is assumed.',
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(JSON.stringify(forecast(), null, 2) + '\n')
