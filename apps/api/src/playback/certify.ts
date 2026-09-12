import { parseArgs } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { configurationDigest, playbackCertificationSchema } from './certification.ts'

const { values } = parseArgs({ options: {
  config: { type: 'string' }, evidence: { type: 'string' }, out: { type: 'string' },
  region: { type: 'string', default: 'US' }, 'ttl-hours': { type: 'string', default: '24' },
}, strict: true })
if (!values.config || !values.evidence || !values.out) throw new Error('Use --config <providers.json> --evidence <redacted-evidence.json> --out <certification.json>.')
const ttlHours = z.coerce.number().int().min(1).max(168).parse(values['ttl-hours'])
const region = z.string().regex(/^[A-Z]{2}$/).parse(values.region)
const [configRaw, evidenceRaw] = await Promise.all([readFile(values.config, 'utf8'), readFile(values.evidence, 'utf8')])
const providers = z.array(playbackCertificationSchema.shape.providers.element).min(1).parse(JSON.parse(evidenceRaw))
const generatedAt = new Date()
const artifact = playbackCertificationSchema.parse({
  version: 1,
  configurationSha256: configurationDigest(configRaw),
  generatedAt: generatedAt.toISOString(),
  expiresAt: new Date(generatedAt.getTime() + ttlHours * 3600_000).toISOString(),
  region,
  providers,
})
await writeFile(values.out, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify({ outcome: 'written', path: values.out, providers: providers.map((provider) => provider.id), expiresAt: artifact.expiresAt }))
