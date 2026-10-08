import assert from 'node:assert/strict'
import { test } from 'node:test'
import { check, probe } from '../infra/uptime/worker.mjs'

function fixture() {
  let stored
  return { STATE: { get: async () => stored, put: async (_, value) => { stored = JSON.parse(value) } }, TELEGRAM_BOT_TOKEN: 'fixture', TELEGRAM_CHAT_ID: '123' }
}
test('external checks send a stopped-VPS alert after two failures and a recovery', async () => {
  const env = fixture()
  const notices = []
  let available = false
  const fetcher = async (url, init) => {
    if (String(url).includes('api.telegram.org')) { notices.push(JSON.parse(init.body).text); return Response.json({ ok: true }) }
    return new Response('', { status: available ? 200 : 503, headers: { 'cache-control': 'no-store' } })
  }
  await check(env, fetcher, 0)
  assert.equal(notices.length, 0)
  await check(env, fetcher, 300000)
  assert.equal(notices.length, 1)
  available = true
  await check(env, fetcher, 600000)
  assert.equal(notices.length, 2)
  assert.match(notices[1], /recovered/)
})
test('failed Telegram delivery remains pending and cached readiness cannot pass', async () => {
  const env = fixture()
  let notices = 0
  const fetcher = async url => {
    if (String(url).includes('telegram')) { notices++; return Response.json({ ok: false }, { status: 429 }) }
    return new Response('', { status: 200, headers: { 'cache-control': 'no-store', 'cf-cache-status': 'HIT' } })
  }
  assert.equal(await probe('https://consumit.online', fetcher), false)
  await check(env, fetcher, 0)
  await check(env, fetcher, 300000)
  assert.equal((await check(env, fetcher, 600000)).alerted, false)
  assert.equal(notices, 2)
})
