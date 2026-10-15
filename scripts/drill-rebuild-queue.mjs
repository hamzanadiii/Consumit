import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const container = 'consumit-rebuild-test-queue-1'
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 30000 })
  if (result.status !== 0) throw new Error('Dedicated queue drill failed.')
  return result.stdout.trim()
}
const label = docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}', container])
assert.equal(label, 'consumit-rebuild-test|queue', 'Only the dedicated fixture may be crashed.')
const key = 'consumit-rebuild:aof-drill', marker = randomUUID(), started = Date.now()
const written = docker(['exec', '-i', container, 'valkey-cli', '--raw'], `SET ${key} ${marker}\nWAITAOF 1 0 5000\n`)
assert.match(written, /OK/); assert.doesNotMatch(written, /ERR|error|unknown command/i)
docker(['kill', '--signal', 'KILL', container]); docker(['start', container])
let recovered = false
for (let attempt = 0; attempt < 20; attempt++) {
  try { if (docker(['exec', container, 'valkey-cli', '--raw', 'GET', key]) === marker) { recovered = true; break } } catch {}
  await new Promise(resolve => setTimeout(resolve, 500))
}
assert.equal(recovered, true, 'Acknowledged AOF data must survive the forced crash.')
docker(['exec', container, 'valkey-cli', 'DEL', key])
process.stdout.write(JSON.stringify({ drill: 'dedicated-queue-forced-crash', persisted: true, recoveryMs: Date.now() - started }) + '\n')
