import { readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises'
import { resolve, relative, dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

// Static evidence only. Never import adapters, evaluate provider scripts, or fetch media.
const defaultRoot = await access('provider_example/src/server/bootstrap.ts').then(() => 'provider_example', () => '../PROVE')
const root = resolve(process.argv[2] ?? defaultRoot)
const base = join(root, 'providers')
const excluded = new Set(['base', 'framework', 'hosts', 'utils'])
const bootstrap = await readFile(join(root, 'src/server/bootstrap.ts'), 'utf8')
const historical = JSON.parse(await readFile(join(root, 'scripts/audit-results.json'), 'utf8'))
const notes = {
  cinehd: ['Movie + episode', 'HLS', 'Server labels; verify language', 'HTML/CSRF playlist handshake; dynamic play origin.'],
  cuevana: ['Movie only; episode method rejects', 'MP4', 'LAT/Spanish', 'Title search and Streamtape helper; metadata module.'],
  insertunit: ['Movie + episode claimed; unsafe fallback', 'HLS', 'English/Russian/multi', 'Evaluates untrusted makePlayer JavaScript; wrong-episode fallback; discards subtitles; embedded TMDB credential must be replaced.'],
  modiplay: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'HTML parsing and second player fetch; SRT/VTT subtitles.'],
  netmirror: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'videodownloader.site and net27.cc; metadata lookup; multiple platform APIs.'],
  nflix: ['Movie + episode', 'HLS/MP4', 'Server labels', 'nflixmovies.app aggregator; source-specific Referer; 30s request exceeds budget.'],
  nhdapi: ['Movie + episode', 'HLS/MP4', 'Server labels', 'nhdapi.com aggregator; dynamic delivery headers; 30s request exceeds budget.'],
  nxsha: ['Movie + episode', 'HLS/MP4', 'Server labels', 'Encrypted multi-server API; local 20s abort; ASS requires unsupported conversion.'],
  onetouchtv: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'api3.devcorp.me helper; metadata and crypto.'],
  perses: ['Movie + episode', 'HLS/MP4', 'Upstream labels', 'streamguide.cfd aggregator; shares upstream with VidCore.'],
  rivestream: ['Movie + episode', 'HLS/MP4', 'English/French/Hindi/multi', 'scrapper.rivestream.app; multiple upstreams; nextgencloudfabric overlap with VaPlayer.'],
  stellar: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'maybeoneday.ch APIs, atlantic.st delivery headers, sub.vdrk.site subtitles.'],
  vaplayer: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'streamdata.vaplayer.ru, nextgencloudfabric.com; metadata dependency.'],
  vidcore: ['Movie + episode', 'HLS/MP4', 'Upstream labels', 'Multi-aggregator fanout; embedded key; Perses/streamguide overlap.'],
  vidcoreio: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'HTML/crypto POST handshake; not registered by the supplied service. Distinct from vidcore.org.'],
  videasy: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'Keep API implementation separate from broken legacy class; enc-dec.app and speedracelight helpers.'],
  vidfast: ['Movie + episode claimed', 'HLS + iframe fallback', 'Unspecified', 'Regex HLS extraction; always appends iframe. Embed output excluded; no direct success evidence.'],
  vidlink: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'enc-dec.app token helper and full-handshake retry; SRT/VTT.'],
  vidlove: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'tungtungtungtungsahur.app helper; player.vidlove.cc delivery Referer.'],
  vidrock: ['Movie + episode', 'HLS', 'Upstream language field', 'Node crypto and encrypted API; duplicate wrapper in vidsrc directory.'],
  vidsrc: ['Movie + episode wrappers', 'Delegated', 'English request', 'Legacy wrappers delegate to Videasy/VidRock with broken relative paths; not an independent fallback.'],
  vidsrcomss: ['Movie + episode', 'HLS', 'English claimed', 'vsembed.ru/cloudnestra HTML chain; not registered by the supplied service.'],
  vidstorm: ['Movie + episode', 'HLS/MP4', 'Quality mislabeled as language', 'Node crypto, sub.vdrk.site; probes first bytes using delivery headers.'],
  vidvault: ['Movie + episode', 'HLS/MP4', 'Original claimed', '25s API request; SRT/VTT output.'],
  vixsrc: ['Movie + episode', 'HLS', 'Manifest audio languages', 'API -> HTML token -> master playlist. Explicit expiry; consolidate root and nested legacy wrappers.'],
  zxcstreams: ['Movie + episode', 'HLS/MP4', 'Original claimed', 'Metadata, crypto and rotating zxc hosts; no end-to-end cancellation.'],
}
async function files(folder) {
  const result = []
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) result.push(...await files(path))
    else if (entry.name.endsWith('.ts')) result.push(path)
  }
  return result.sort()
}
const providers = []
for (const dir of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!dir.isDirectory() || dir.name.startsWith('_') || excluded.has(dir.name)) continue
  const sources = []
  const imports = new Set(), hosts = new Set(), missing = new Set()
  for (const file of await files(join(base, dir.name))) {
    const text = await readFile(file, 'utf8')
    sources.push({ path: relative(root, file).replaceAll('\\', '/'), sha256: createHash('sha256').update(text).digest('hex') })
    for (const [, specifier] of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      imports.add(specifier)
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(file), specifier)
        const found = await Promise.all(['', '.ts', '.js', '/index.ts'].map((suffix) => access(target + suffix).then(() => true, () => false)))
        if (!found.some(Boolean)) missing.add(specifier)
      }
    }
    for (const [, host] of text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) hosts.add(host)
  }
  const auditId = dir.name === 'cuevana' ? 'cuevanaes' : dir.name
  const rows = Object.values(historical).filter((row) => row.provider === auditId)
  const checks = rows.flatMap((row) => Object.values(row.servers ?? {}).flatMap((server) => server.checked ?? []))
  const note = notes[dir.name] ?? ['Unreviewed', 'Unknown', 'Unknown', 'New provider requires manual review.']
  providers.push({ id: dir.name, registeredInExample: bootstrap.includes(`providers/${dir.name}/`), status: 'disabled',
    consumitAdapter: ['vixsrc', 'vidrock', 'nhdapi', 'vaplayer', 'stellar'].includes(dir.name) ? 'ported; activation gated; see docs/PROVIDERS.md' : 'not ported',
    delivery: dir.name === 'stellar' ? 'direct (CORS-open)' : dir.name === 'vidsrc' || dir.name === 'vidfast' || dir.name === 'insertunit' ? 'incomplete' : 'relay-required (declared; unverified)',
    support: note[0], formats: note[1], language: note[2], notes: note[3],
    expiry: dir.name === 'vixsrc' ? 'Explicit token expiry, not normalized by legacy contract' : 'No validated playback expiry contract',
    cancellation: 'No caller cancellation propagated end-to-end',
    historical: { titleRows: rows.length, checked: checks.length, ok: checks.filter((entry) => entry.ok === true).length, date: null },
    imports: [...imports].sort(), missingRelativeImports: [...missing].sort(), observedHosts: [...hosts].sort(), sources })
}
const output = resolve('docs/provider-audit.json')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify({ source: 'provider_example', method: 'Static source and supplied historical audit; no live probes', providers }, null, 2) + '\n')
const table = ['# Provider matrix', '', 'Source: `provider_example/`. Rebuild with `node scripts/audit-providers.mjs`. Full dependency, host, provenance hashes, and missing-import evidence are in [provider-audit.json](./provider-audit.json).', '',
  'All 26 handoff directories remain excluded from runtime imports. Twenty-three are registered by the example service. Its TypeScript alias supplies `@omss/framework`; the old `providers/registry.ts` and legacy wrappers still contain broken imports. Consumit has separate ports of VixSrc, VidRock, NHD API, and VAPlayer; activation remains gated. See [PROVIDERS.md](./PROVIDERS.md) for current integration and live diagnostic evidence. No license/provenance grant was supplied for adoption.', '',
  'Delivery classification reflects explicit source headers/proxy calls, not proven necessity. Resolution Referer alone is not evidence that media requires a relay. No integration currently qualifies as verified direct-compatible. VidFast iframe output is excluded. Other incomplete entries require repair before probes.', '',
  'Historical “ok/checks” below are undated URL probes, not playback success rates, episode coverage, browser compatibility, or approval. Zero checks means no evidence. Expiry and caller cancellation are missing across the shared contract; VixSrc alone parses explicit token expiry. Language values are claims, not verified tracks.', '',
  '| Identity | Delivery | Movie/episode support | Formats | Audio evidence | Historical ok/checks | Gaps |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...providers.map((p) => `| ${p.id} | ${p.delivery} | ${p.support} | ${p.formats} | ${p.language} | ${p.historical.ok}/${p.historical.checked} | ${p.notes} |`), '',
  '## Pilot recommendation', '',
  'Evaluate VixSrc first for its explicit expiry and manifest audio, VidRock second for its small API/crypto boundary, and NHD API third because its supplied artifact contains successful URL probes. This is an evaluation order, not a claim that any provider is stable or permitted. NHD needs a much smaller request budget and upstream correlation mapping. All three require permission, region, provenance, fresh movie/episode probes, codec/CORS checks, and delivery-header experiments before enablement.', '',
  'Avoid InsertUnit until untrusted script evaluation and wrong-episode fallback are removed. Avoid VidFast unless direct HLS delivery is demonstrated. Do not count VidSrc wrappers as independent providers. Consolidate VixSrc root/nested wrappers into the vixsrc identity and VidRock wrappers into vidrock; keep vidcore.org and vidcore.io distinct but investigate upstream overlap. Retired implementations remain excluded.', '',
  '## Approval record required before activation', '',
  'Record permitted media/catalog, license/provenance, authorized countries, resolution hosts, media/CDN hosts, resolution headers versus media headers, expiry source, codec/CORS measurements, upstream group, and an owner. No credentials or signed playback URLs belong in audit artifacts.', '']
await writeFile(resolve('docs/PROVIDER-MATRIX.md'), table.join('\n'))
console.log(`Audited ${providers.length} provider directories; registered ${providers.filter((p) => p.registeredInExample).length}; no adapters executed.`)
