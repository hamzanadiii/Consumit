import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'

/** Explicit OTLP export only; never capture URLs, credentials, or member identifiers. */
export function startPlaybackTelemetry() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return { shutdown: async () => {} }
  const sdk = new NodeSDK({
    serviceName: 'consumit-api',
    autoDetectResources: false,
    traceExporter: new OTLPTraceExporter({ timeoutMillis: 3000 }),
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ timeoutMillis: 3000 }),
      exportIntervalMillis: 15000,
      exportTimeoutMillis: 5000,
    })],
  })
  sdk.start()
  return sdk
}
