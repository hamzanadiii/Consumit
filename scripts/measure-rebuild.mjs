import { writeFile } from 'node:fs/promises'
const origin = process.env.REBUILD_MEASURE_ORIGIN || 'http://127.0.0.1:18591'
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):(?:3001|18591)$|^https:\/\/consumit\.online$/.test(origin)) throw new Error('Choose the controlled fixture or reviewed Consumit baseline origin.')
const results = { at: new Date().toISOString(), runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`, origin, vantage: process.env.REBUILD_MEASURE_VANTAGE || 'operator workstation', scope: 'Low-rate warm baseline; not a capacity test.', routes: [] }
for (const path of ['/v1/titles/discover?kind=movie', '/v1/titles/search?q=Dune&kind=movie', '/v1/titles/movie/693134']) {
  const times = [], statuses = {}; let coldMs
  for (let sample = 0; sample < 11; sample++) {
    const started = performance.now()
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(15000) }); await response.arrayBuffer()
    const ms = performance.now() - started
    statuses[response.status] = (statuses[response.status] ?? 0) + 1
    if (!sample) coldMs = ms
    else if (response.ok) times.push(ms)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  times.sort((left, right) => left - right)
  results.routes.push({ path, coldMs, successfulWarm: times.length, statuses, p95Ms: times[Math.ceil(times.length * 0.95) - 1] ?? null })
}
const output = JSON.stringify(results, null, 2)
if (process.env.REBUILD_MEASURE_OUTPUT) await writeFile(process.env.REBUILD_MEASURE_OUTPUT, output + '\n')
else process.stdout.write(output + '\n')
