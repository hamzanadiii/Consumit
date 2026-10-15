# GA4 public browsing rollout — October 12, 2026

The owner supplied the Consumit GA4 stream measurement ID `G-K0BSZ9ZM48` and confirmed Enhanced measurement was turned off before deployment. Consumit sends manual grouped public page views only after device opt-in. The Privacy Policy describes Google, analytics cookies, the scope of collection and revocation.

## Verification

| Check | Result |
| --- | --- |
| Frontend consent/privacy/legal checks | 25 passed |
| Web type checking and changed-file lint | Passed |
| Production configuration checks | 14 passed |
| Local and production web builds | Passed |
| Mechanical UI scan | No findings |
| Fixture desktop/phone checks | Passed; no page errors |
| Live desktop/phone checks | Passed; no page errors |
| Live Google collector responses | 204 for each initial consented page view |

Chrome checks used 1440×1000 and 390×844 viewports. Before opt-in, no Google request was made. After Allow analytics, the correct tag loaded and exactly one initial manual view was queued for `/privacy`, without the test query or fragment. Private-route navigation set Google's disable flag; returning restored public collection. Decline disabled the tag and persisted across reload with no new Google request. Fixture traffic was intercepted; two initial live visits were sent to the owner's stream. Sanitized evidence and reviewed desktop/phone screenshots are retained under ignored `local/analytics-review`. Browser emulation does not certify every physical device.

Google collector HTTP acceptance does not prove that events have appeared in the owner's GA4 dashboard. Realtime or Tag Assistant is the next report-side observation. Analytics totals include only visitors who opt in and whose browser allows the tag. Keeping Enhanced measurement off remains a property configuration requirement.

## Release and rollback

Active web image: `consumit-web:analytics-20261012T193851257Z`. The web container became healthy; the API container ID matched its pre-rollout snapshot. No database migration, provider settings change, relay change or API restart was performed.

The installer validates all source preimages and uses exact marker replacements for the existing layout and build wiring. It adds only the analytics modules and scoped Privacy changes to the production checkout. The local checkout's other web work was not uploaded. The actual running prior web image had advanced since the initial read; the installer snapshotted that current image instead of using the earlier observation.

Private rollback snapshot: `/opt/consumit/infra/secrets/analytics-backups/analytics-20261012T193851257Z`. Previous web image: `consumit-web:e84060152707-20261012T193249986Z`. The snapshot retains the prior environment and touched existing source files. Restore the recorded image with a web-only Compose override and `up -d --no-deps --no-build --force-recreate --wait web`; do not reuse an unrelated shared API release tag. New analytics modules can be removed only when reverting the corresponding layout and Privacy imports.

`CONSUMIT_WEB_RELEASE` keeps this web image independent of `CONSUMIT_RELEASE`. Future full releases must intentionally update or clear that override. Build-time analytics configuration and owner-facing GA4 setup are described in [the runbook](../runbooks/google-analytics.md).
