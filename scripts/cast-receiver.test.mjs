import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
const source = readFileSync(new URL('../packages/web-core/public/cast/receiver.js', import.meta.url), 'utf8')
function receiver(response) {
  let interceptor, config
  const requests = []
  const manager = { setMessageInterceptor(_type, handler) { interceptor = handler }, addEventListener() {} }
  const context = { getPlayerManager: () => manager, addEventListener() {}, start(options) { config = options.playbackConfig } }
  vm.runInNewContext(source, {
    cast: { framework: { CastReceiverContext: { getInstance: () => context }, PlaybackConfig: function () {}, messages: { MessageType: { LOAD: 'LOAD' } }, events: { category: { CORE: 'CORE' }, EventType: { MEDIA_STATUS: 'STATUS' } }, system: { EventType: { SHUTDOWN: 'SHUTDOWN' } } } },
    window: { location: { href: 'https://consumit.online/cast/receiver.html', origin: 'https://consumit.online' } },
    document: { getElementById: () => ({ hidden: false }) }, URL, AbortSignal,
    fetch: async (url, options) => { requests.push({ url, options }); return response },
  })
  return { load: data => interceptor(data), config, requests }
}
test('TV claims a handoff, loads only authorized media and includes its cookie only on first-party media', async () => {
  const tv = receiver(Response.json({ src: 'https://consumit.online/media/authorized', type: 'hls' }))
  const result = await tv.load({ media: { contentId: 'https://consumit.online/cast/relay', customData: { delivery: 'relay', handoffToken: 'a'.repeat(64), position: 42, playing: false } } })
  assert.equal(result.media.contentId, 'https://consumit.online/media/authorized')
  assert.equal(result.currentTime, 42)
  assert.equal(tv.requests.length, 1)
  assert.equal(tv.requests[0].options.credentials, 'same-origin')
  assert.equal(result.media.customData.handoffToken, undefined)
  assert.equal(result.autoplay, false)
  const request = { url: result.media.contentId, headers: { Authorization: 'discarded' } }
  tv.config.segmentRequestHandler(request)
  assert.equal(request.withCredentials, true)
  const key = { url: "https://consumit.online/media/key" }; tv.config.licenseRequestHandler(key); assert.equal(key.withCredentials, true)
  assert.equal(Object.keys(request.headers).length, 0)
  assert.throws(() => tv.config.segmentRequestHandler({ url: 'https://other.example/media/x' }))
})
test('missing/rejected handoffs and foreign sources cannot fall back to an unprotected relay', async () => {
  await assert.rejects(receiver(Response.json({})).load({ media: {}, customData: { delivery: 'relay' } }))
  await assert.rejects(receiver(new Response(null, { status: 403 })).load({ media: {}, customData: { delivery: 'relay', handoffToken: 'a'.repeat(64) } }))
  await assert.rejects(receiver(Response.json({ src: 'https://other.example/movie.mp4' })).load({ media: {}, customData: { delivery: 'relay', handoffToken: 'a'.repeat(64) } }))
})
test('direct casting keeps its source and remains credential-free', async () => {
  const tv = receiver(Response.json({}))
  const result = await tv.load({ media: { contentId: 'https://provider.example/movie.mp4' }, customData: { delivery: 'direct' } })
  assert.equal(result.media.contentId, 'https://provider.example/movie.mp4')
  assert.equal(tv.requests.length, 0)
  const request = { url: result.media.contentId }
  tv.config.segmentRequestHandler(request)
  assert.equal(request.withCredentials, false)
})
