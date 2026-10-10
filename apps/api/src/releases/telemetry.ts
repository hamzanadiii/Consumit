import { metrics } from '@opentelemetry/api'
function createInstruments() {
  const meter = metrics.getMeter('consumit.releases')
  return { catalog: meter.createCounter('releases.catalog.refreshes'), checks: meter.createCounter('releases.verification.results'),
    notifications: meter.createCounter('releases.notifications.inserted'), age: meter.createHistogram('releases.queue.age', { unit: 's' }) }
}
// Static imports run before index starts the SDK. Metrics created then are noop.
let instruments: ReturnType<typeof createInstruments> | undefined
const current = () => instruments ??= createInstruments()
export function recordCatalogRefresh(outcome: 'success' | 'failed') { current().catalog.add(1, { outcome }) }
export function recordReleaseCheck(passed: boolean, inserted: number) { const data = current(); data.checks.add(1, { outcome: passed ? 'passed' : 'failed' }); data.notifications.add(inserted) }
export function recordReleaseQueue(seconds: number) { current().age.record(seconds) }
