import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(process.env.MINIFLARE_MODULE ?? resolve(process.env.APPDATA, 'npm/node_modules/wrangler/node_modules/miniflare/dist/src/index.js')).href)
// Runs only deterministic local workerd fixtures; no production network.
function zip(name, text) {
  const filename = Buffer.from(name), data = Buffer.from(text), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22)
  let crc = 0xffffffff
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
  crc = (crc ^ 0xffffffff) >>> 0
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26)
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(local.length + filename.length + data.length, 16)
  return Buffer.concat([local, filename, data, central, filename, end])
}
const formats = ['srt', 'vtt', 'ass', 'zip']
const secret = 'subtitle-smoke-fixture-secret-32-characters'
let calls = 0
const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'subtitle-smoke',
  modules: true, scriptPath: resolve('tmp/subtitle-worker.js'), compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
  bindings: { SUBTITLES_ENABLED: 'true', R2_VERIFIED: 'true', SUBTITLE_SECRET: secret, APP_ORIGIN: 'https://consumit.example.com' },
  durableObjects: { SUBTITLE_SEARCHES: { className: 'SubtitleSearch', useSQLite: true }, SUBTITLE_PROVIDERS: { className: 'SubtitleProviderSearch', useSQLite: true } }, r2Buckets: ['SUBTITLE_FILES'],
  outboundService: async request => {
    calls++
    const url = new URL(request.url)
    if (url.hostname === 'sub.vdrk.site') return Response.json(Array.from({ length: 20 }, (_, i) => ({ file: `https://cache.vdrk.site/${i}.${formats[i % 4]}`, label: 'English' })))
    if (url.hostname === 'cache.vdrk.site') {
      if (url.pathname.endsWith('.vtt')) return new Response('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nVTT from workerd\n')
      if (url.pathname.endsWith('.ass')) return new Response('[Script Info]\nScriptType: v4.00+\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,ASS from workerd\n')
      const srt = '1\n00:00:01,000 --> 00:00:02,000\nSRT from workerd\n'
      return new Response(url.pathname.endsWith('.zip') ? zip('English.srt', srt.replace('SRT', 'ZIP')) : srt)
    }
    return Response.json([])
  },
}] }))
const call = async body => {
  const response = await runtime.dispatchFetch('https://worker.example.com/v1/subtitle-operation', { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal(response.status, 200)
  return response.json()
}
try {
  const body = { operation: 'discover', ref: { kind: 'movie', id: 550 }, query: { type: 'movie', tmdbId: 550, langs: ['en'] } }
  const results = await Promise.all(Array.from({ length: 25 }, () => call(body)))
  const searchId = results[0].events[0].searchId
  assert.equal(new Set(results.map(result => result.events[0].searchId)).size, 1)
  const coldCalls = calls
  await call(body)
  assert.equal(calls, coldCalls)
  const page = await call({ operation: 'page', searchId, language: 'en', cursor: 0 })
  assert.equal(page.tracks.length, 20)
  for (const candidate of page.tracks.slice(0, 4)) {
    const track = await call({ operation: 'prepare', searchId, candidateId: candidate.id })
    assert.match(track.contentChecksum, /^[a-f0-9]{64}$/)
    const file = await runtime.dispatchFetch(track.url)
    assert.equal(file.status, 200)
    assert.match(await file.text(), /from workerd/)
  }
  const callsBeforeRecording = calls
  const context = { ref: body.ref, videoVersion: `vv-${'a'.repeat(64)}`, providerId: 'fixture', hosts: ['cache.vdrk.site'], expiresAt: new Date(Date.now() + 600000).toISOString(), captions: [{ id: 'attached', label: 'English current source', language: 'en', url: 'https://cache.vdrk.site/0.srt', format: 'srt' }], headers: {} }
  const attached = await call({ ...body, context })
  const attachedId = attached.events[0].searchId
  assert.notEqual(attachedId, searchId)
  const attachedPage = await call({ operation: 'page', searchId: attachedId, language: 'en', cursor: 0 })
  assert.equal(attachedPage.tracks[0].match, 'source')
  const different = await call({ ...body, context: { ...context, videoVersion: `vv-${'b'.repeat(64)}` } })
  assert.notEqual(different.events[0].searchId, attachedId)
  assert.equal(calls, callsBeforeRecording, 'recording-specific captions must reuse shared generic discovery')
  console.log(JSON.stringify({ runtime: 'workerd', simultaneous: 25, coldUpstreamCalls: coldCalls, warmUpstreamCalls: 0, choices: page.tracks.length, formats, preparation: 'passed', r2Delivery: 'passed', recordingIsolation: 'passed', genericReuseAcrossRecordings: 'passed' }))
} finally { await runtime.dispose() }
