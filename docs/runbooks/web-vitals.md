# Web Vitals baseline

Consumit reports a small anonymous browser measurement set to
`POST /v1/telemetry/web-vitals`. The API accepts only CLS, FCP, INP, LCP, and
TTFB values plus a fixed route group. It rejects URLs, referrers, identifiers,
and extra payload fields, then writes values to bounded OpenTelemetry
histograms. Nothing is stored in Postgres. Browser requests omit credentials;
the endpoint is rate limited and does not require a member session.

The OTEL collector exports these aggregates to Prometheus. It normalizes dots
to underscores and appends the standard unit suffix, so the timing histogram is
named `consumit_web_vitals_timing_milliseconds` ([exporter naming rules](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/pkg/translator/prometheus/README.md)). Useful p75 queries are:

```promql
histogram_quantile(0.75, sum by (le, page) (rate(consumit_web_vitals_timing_milliseconds_bucket{metric="LCP"}[1h])))
histogram_quantile(0.75, sum by (le, page) (rate(consumit_web_vitals_timing_milliseconds_bucket{metric="INP"}[1h])))
histogram_quantile(0.75, sum by (le, page) (rate(consumit_web_vitals_cls_bucket{metric="CLS"}[1h])))
```

Compare the raw timing query results in milliseconds: LCP to 2,500 and INP to
200; compare CLS to 0.1. These are the plan's p75 thresholds. FCP and TTFB are
diagnostic signals, not launch budgets. Explicit histogram buckets preserve
useful resolution around each threshold. Quantiles remain estimates, especially
at low traffic; inspect sample counts and use a sufficiently long time window.

This is instrumentation, not a production baseline. Deploy the API, web app,
OTEL collector, and Prometheus together, then collect representative traffic
before assessing a budget. The current web shell is still dynamically rendered
because it resolves the member session at the root layout, so these metrics do
not imply shared-page caching or an LCP improvement.
