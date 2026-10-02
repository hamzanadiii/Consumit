import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

// Source-only evidence. This command never contacts or executes a provider.
const configPath = resolve(process.argv[2] ?? 'infra/playback/providers.local.json')
const rows = JSON.parse(await readFile(configPath, 'utf8'))
if (!Array.isArray(rows)) throw new Error('Provider configuration must be an array.')

const sourceName = (adapter) => {
  if (adapter === 'vixsrc-it') return 'vixsrc'
  if (adapter === 'catflix') return 'vidnest'
  if (adapter === 'filmuainary') return 'filmu'
  if (adapter === 'stignebula' || adapter === 'stigorion') return 'stigstream'
  if (adapter === 'riveapollo') return 'rivedirect'
  if (adapter.startsWith('rive')) return 'rivestream'
  return adapter
}

const adapters = []
for (const name of [...new Set(rows.map((row) => row.adapter))].sort()) {
  const configured = rows.filter((row) => row.adapter === name)
  const file = join('packages/provider-sdk/src/adapters', `${sourceName(name)}.ts`)
  const source = await readFile(file, 'utf8')
  adapters.push({
    adapter: name,
    file,
    rows: configured.map((row) => ({ id: row.id, enabled: row.enabled, regions: row.regions, delivery: 'direct' })),
    staticChecks: {
      usesAdapterResultBoundary: /\badapter\(/.test(source),
      hasDeadlineHandling: /\baccessDeadline\(/.test(source),
      hasDirectGlobalFetch: /\bfetch\(/.test(source),
      executesProviderCode: /\beval\s*\(|new\s+Function\s*\(|WebAssembly\.(?:compile|instantiate)/.test(source),
      importsOpaqueVendoredCode: /aphrodite-gate/.test(source),
    },
    // Resolve success, origin/CDN CORS, codecs, and first frame require a
    // permitted live source; a source scan cannot certify them.
    browserPlayback: name === 'vixsrc' ? 'controlled-fixture-tested' : 'not-established-by-static-audit',
    liveResolveLatency: 'unmeasured',
  })
}

console.log(JSON.stringify({
  method: 'Static source and configured-input audit; no provider network calls',
  config: relative(process.cwd(), configPath).replaceAll('\\', '/'),
  configuredRows: rows.length,
  enabledRows: rows.filter((row) => row.enabled).length,
  adapterCount: adapters.length,
  centralBoundaries: ['ProviderHttp DNS-pinned bounded transport', 'validatedSources HTTPS and media-host allowlist', 'resolver attempt deadline and viewer-failure circuit'],
  adapters,
}, null, 2))
