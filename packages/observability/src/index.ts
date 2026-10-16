import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { AggregationType, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { metrics } from '@opentelemetry/api'
import { monitorEventLoopDelay } from 'node:perf_hooks'

export function startPlaybackTelemetry() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return { shutdown: async () => {} }
  const sdk = new NodeSDK({ serviceName: process.env.OTEL_SERVICE_NAME || 'consumit-api', autoDetectResources: false,
    traceExporter: new OTLPTraceExporter({ timeoutMillis: 3000 }),
    views: [
      { instrumentName: 'web.vitals.timing', aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [50,100,200,300,500,750,1000,1500,2000,2500,3000,4000,5000,7500,10000,15000,30000,60000,120000] } } },
      { instrumentName: 'web.vitals.cls', aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [0.01,0.025,0.05,0.075,0.1,0.15,0.25,0.5,0.75,1,2.5,5,10] } } },
    ],
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ timeoutMillis: 3000 }), exportIntervalMillis: 15000, exportTimeoutMillis: 5000 })],
  })
  sdk.start()
  const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable()
  const meter = metrics.getMeter('consumit.runtime')
  meter.createObservableGauge('runtime.memory.rss', { unit: 'By' }).addCallback(result => result.observe(process.memoryUsage().rss))
  meter.createObservableGauge('runtime.event_loop.lag', { unit: 'ms' }).addCallback(result => result.observe(Number.isFinite(loop.mean) ? loop.mean / 1e6 : 0))
  const reset = setInterval(() => loop.reset(), 15000); reset.unref()
  return { async shutdown() {
    clearInterval(reset); loop.disable()
    try { await sdk.shutdown() }
    catch { process.stderr.write('{"event":"telemetry_shutdown_incomplete"}\n') }
  } }
}

export function observePool(stats: () => { total: number; idle: number; waiting: number; maximum: number }) {
  const meter = metrics.getMeter('consumit.database')
  const gauges = ['total', 'idle', 'waiting', 'maximum'].map(name => ({ name, gauge: meter.createObservableGauge(`database.pool.${name}`) }))
  const observers = gauges.map(({ name, gauge }) => {
    const callback: Parameters<typeof gauge.addCallback>[0] = result => { const value = stats(); result.observe(value[name as keyof typeof value]) }
    gauge.addCallback(callback); return () => gauge.removeCallback(callback)
  })
  return () => { for (const close of observers) close() }
}
