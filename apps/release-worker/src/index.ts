import { chromium } from 'playwright'
import type { ReleaseProbeSource } from '@consumit/contracts'
import { createProbeProxy } from './network'
import { createWorker, workerConfigSchema } from './worker'

const config = workerConfigSchema.parse({ apiOrigin: process.env.RELEASE_API_ORIGIN, appOrigin: process.env.RELEASE_APP_ORIGIN, secret: process.env.RELEASE_WORKER_SECRET })
let source: ReleaseProbeSource | null = null
const connectHost = new URL(config.appOrigin).protocol === 'http:' ? process.env.RELEASE_CONNECT_HOST : undefined
const proxy = await createProbeProxy(config.appOrigin, () => source, connectHost, connectHost ? Number(process.env.RELEASE_CONNECT_PORT || 80) : undefined)
const browser = await chromium.launch({ headless: true, chromiumSandbox: true, proxy: { server: proxy.url }, args: ['--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] })
let stopped = false
const stop = () => { stopped = true; void browser.close() }
process.once('SIGTERM', stop); process.once('SIGINT', stop)
const worker = createWorker(config, browser, next => { source = next }, event => process.stdout.write(`${JSON.stringify({ event })}\n`))
try {
  while (!stopped) {
    let worked = false
    try { worked = await worker.runOnce() } catch { if (!stopped) process.stderr.write('{"event":"release_worker_failure"}\n') }
    if (!worked && !stopped) await new Promise(resolve => setTimeout(resolve, 10_000))
  }
} finally { await browser.close(); await proxy.close() }
