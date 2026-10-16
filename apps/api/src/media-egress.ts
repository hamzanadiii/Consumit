import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createMediaEgress, type MediaBudgetState } from './playback/media-egress.ts'
import { parseRelayProviders, validateRelayNode } from './playback/relay.ts'

const node = validateRelayNode({ origin: process.env.PLAYBACK_NODE_ORIGIN ?? '', secret: process.env.PLAYBACK_NODE_SECRET ?? '', providers: parseRelayProviders(process.env.PLAYBACK_NODE_PROVIDERS ?? '{}') })
const appOrigin = process.env.APP_ORIGIN ?? ''
if (new URL(appOrigin).origin !== appOrigin || !appOrigin.startsWith('https://') || process.env.PLAYBACK_NODE_ENABLED !== 'true') throw new Error('Media daemon requires explicit HTTPS configuration.')
const file = process.env.MEDIA_BUDGET_FILE ?? '/var/lib/consumit/media/budget.json'
await mkdir(dirname(file), { recursive: true })
let state: MediaBudgetState
try { state = JSON.parse(await readFile(file, 'utf8')) }
catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw new Error('Invalid persistent media budget.')
  state = { day: new Date().toISOString().slice(0, 10), reserved: 0 }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(state.day) || !Number.isSafeInteger(state.reserved) || state.reserved < 0) throw new Error('Invalid persistent media budget.')
const save = async (next: MediaBudgetState) => { await writeFile(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 }); await rename(`${file}.tmp`, file) }
await save(state)
const integer = (name: string, fallback: number, maximum: number) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new Error('Invalid media resource limit.')
  return value
}
const media = createMediaEgress({ RELAY_ENABLED: 'true', RELAY_SECRET: node.secret, APP_ORIGIN: appOrigin, RELAY_PROVIDERS: JSON.stringify(node.providers), RELAY_DISCOVERY_PROVIDERS: JSON.stringify({ 'lookmovie-relay': 'lookmovie-v1' }) }, {
  active: integer('MEDIA_MAX_ACTIVE', 16, 64), bytesPerSecond: integer('MEDIA_BYTES_PER_SECOND', 1_500_000, 12_500_000), dailyBytes: integer('MEDIA_DAILY_BYTES', 8_000_000_000, 100_000_000_000), deadlineMs: 60_000,
}, { state, save })
const server = createServer(async (request, response) => {
  const controller = new AbortController()
  request.once('aborted', () => controller.abort()); response.once('close', () => controller.abort())
  try {
    const url = new URL(request.url ?? '/', node.origin)
    if (request.headers.host !== new URL(node.origin).host || request.headers['x-forwarded-proto'] !== 'https' || !url.pathname.startsWith('/media/') || url.search || request.headers['transfer-encoding'] || request.headers['content-length'] && request.headers['content-length'] !== '0') { response.writeHead(404).end('Media unavailable.'); return }
    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    const result = await media.fetch(new Request(`${node.origin}${url.pathname}`, { method: request.method ?? 'GET', headers, signal: controller.signal }))
    response.writeHead(result.status, Object.fromEntries(result.headers))
    if (result.body) await pipeline(Readable.fromWeb(result.body), response, { signal: controller.signal }); else response.end()
  } catch { if (!response.headersSent) response.writeHead(503).end('Media unavailable.'); else response.destroy() }
})
server.requestTimeout = 5000; server.headersTimeout = 5000; server.timeout = 65000
server.listen(8788, '0.0.0.0')
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close())
setInterval(() => console.log(JSON.stringify({ event: 'media.budget', ...media.snapshot() })), 60_000).unref()
