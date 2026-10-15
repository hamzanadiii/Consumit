import { spawn } from 'node:child_process'
import { createServer, request as proxyRequest } from 'node:http'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Use a dedicated test database.')
await mkdir('local', { recursive: true })
const providerFile = resolve('local/rebuild-browser-providers.json')
await writeFile(providerFile, JSON.stringify([{ id: 'fixture', adapter: 'static', regions: ['US'], mediaKinds: ['movie'], mediaHosts: ['rebuild-media.example'], upstreamGroup: 'fixture', entries: [{ ref: { kind: 'movie', id: 693134 }, sources: [{ key: 'main', url: 'https://rebuild-media.example/reference.mp4', type: 'native', language: 'en', headers: {}, subtitles: [], expiresAt: '2099-01-01T00:00:00.000Z' }] }] }]))
const start = role => spawn(process.execPath, ['--import', './apps/api/node_modules/tsx/dist/loader.mjs', 'tests/rebuild/backend.mts', role], { env: { ...process.env, REBUILD_PROVIDER_FILE: providerFile }, stdio: 'inherit', windowsHide: true })
const api = start('api')
async function ready(port) {
  for (let tries = 0; tries < 100; tries++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health/ready`)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error('Fixture process did not become ready.')
}
await ready(18589)
const playback = start('playback'); await ready(18590)
const server = createServer((request, response) => {
  const path = request.url ?? '/'
  if (path === '/__fixtures/stop-playback' && request.method === 'POST') { playback.kill('SIGTERM'); response.writeHead(204).end(); return }
  if (path.startsWith('/v1/internal/')) { response.writeHead(404).end(); return }
  const port = path.startsWith('/v1/playback/') || path.startsWith('/v1/subtitles') && !path.startsWith('/v1/subtitles/preferences') ? 18590 : 18589
  const upstream = proxyRequest({ hostname: '127.0.0.1', port, path, method: request.method, headers: request.headers }, result => { response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response) })
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(503); response.end() })
  request.pipe(upstream)
})
server.listen(18591, '127.0.0.1')
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(); api.kill(signal); playback.kill(signal) })
