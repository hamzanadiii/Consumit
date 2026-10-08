import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { AggregationType, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'

/** Explicit OTLP export only; never capture URLs, credentials, or member identifiers. */
export function startPlaybackTelemetry() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return { shutdown: async () => {} }
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'consumit-api',
    autoDetectResources: false,
    traceExporter: new OTLPTraceExporter({ timeoutMillis: 3000 }),
    // Bucket boundaries match the dimensions used by the Web Vitals runbook.
    // Values remain aggregate histograms; no event-level record is persisted.
    views: [
      { instrumentName: 'web.vitals.timing', aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 30000, 60000, 120000] } } },
      { instrumentName: 'web.vitals.cls', aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.25, 0.5, 0.75, 1, 2.5, 5, 10] } } },
    ],
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ timeoutMillis: 3000 }),
      exportIntervalMillis: 15000,
      exportTimeoutMillis: 5000,
    })],
  })
  sdk.start()
  return sdk
}
