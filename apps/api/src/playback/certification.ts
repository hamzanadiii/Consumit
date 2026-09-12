import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { ProviderRegistration } from '@consumit/provider-sdk'
import type { CapabilityRegistry } from './delivery.ts'

const rowSchema = z.object({
  providerId: z.string().min(1).max(80),
  host: z.string().min(1).max(253),
  kind: z.enum(['manifest', 'segment', 'key', 'subtitle', 'mp4']),
  engine: z.enum(['hlsjs', 'native']),
  capability: z.literal('direct'),
  confidence: z.number().min(0).max(1),
  probes: z.number().int().min(5),
  successes: z.number().int().min(5),
  streak: z.number().int().min(5),
  updatedAt: z.number().int().positive(),
})

export const playbackCertificationSchema = z.object({
  version: z.literal(1),
  configurationSha256: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  region: z.string().regex(/^[A-Z]{2}$/),
  providers: z.array(z.object({
    id: z.string().min(1).max(80),
    checks: z.array(z.object({ name: z.string().min(1).max(80), pass: z.literal(true) })).min(1),
    rows: z.array(rowSchema).min(1),
  })).min(1).max(30),
})

export type PlaybackCertification = z.infer<typeof playbackCertificationSchema>

export function configurationDigest(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function loadPlaybackCertification(options: {
  path: string
  mediaConfigPath: string
  providers: readonly ProviderRegistration[]
  registry: CapabilityRegistry
  region: string
  now?: () => number
}): Promise<ProviderRegistration[]> {
  const now = options.now ?? Date.now
  const [certRaw, configRaw] = await Promise.all([readFile(options.path, 'utf8'), readFile(options.mediaConfigPath, 'utf8')])
  if (certRaw.length > 2_000_000) throw new Error('Playback certification exceeds its limit.')
  const cert = playbackCertificationSchema.parse(JSON.parse(certRaw))
  if (cert.region !== options.region) throw new Error('Playback certification region does not match TMDB_REGION.')
  if (cert.configurationSha256 !== configurationDigest(configRaw)) throw new Error('Playback certification does not match PLAYBACK_MEDIA_CONFIG.')
  if (Date.parse(cert.expiresAt) <= now() || Date.parse(cert.generatedAt) > now() + 60_000) throw new Error('Playback certification is expired or not yet valid.')

  const configured = new Map(options.providers.map((provider) => [provider.adapter.id, provider]))
  const certified = new Set<string>()
  const rows = []
  for (const provider of cert.providers) {
    const registration = configured.get(provider.id)
    if (!registration) continue
    const allowed = provider.rows.every((row) => row.providerId === provider.id && registration.mediaHosts.some((host) => host.startsWith('*.')
      ? row.host.endsWith(host.slice(1))
      : row.host === host))
    if (!allowed) continue
    certified.add(provider.id)
    rows.push(...provider.rows.map((entry) => ({
      host: entry.host,
      kind: entry.kind,
      engine: entry.engine,
      row: { capability: entry.capability, confidence: entry.confidence, probes: entry.probes, successes: entry.successes, streak: entry.streak, updatedAt: entry.updatedAt },
    })))
  }
  if (!certified.size || !rows.length) throw new Error('Playback certification contains no usable approved providers.')
  await options.registry.importRows(rows)
  return options.providers.filter((provider) => certified.has(provider.adapter.id))
}
