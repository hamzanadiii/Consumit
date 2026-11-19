# Taste publication implementation

Approved 2026-10-22: cinematic monthly-cover profiles, curated customization,
chaptered collections, focused rating/review/log flows, private drafts, editions,
evidence-based comparisons, share exports, Community, discussion and moderation.

Preserve existing workspace work, member privacy choices, catalog identities,
and playback. Use additive migrations and the existing authenticated API.

## Delivery record

- [x] Typed contracts and durable storage with visibility-aware projections.
- [x] Profile publication and customization; concise archive navigation.
- [x] Chaptered collection creation and revision-safe editing.
- [x] Independent review/log flows, drafts, spoilers and stable review pages.
- [x] Monthly editions, comparisons and share artwork.
- [x] Community, comments, subscriptions, notifications and moderation.
- [x] Automated checks, rendered verification and canonical documentation.

## Design contract

Experience mode for profiles and reading; Operate mode for editors. Preserve
Cinema After Midnight, Charter, the shared FilScreen shell and native controls.
The first viewport pairs a cinematic cover with identity, a member-authored
statement and chosen title. Favorites and authored work follow in an editorial
rhythm. Mobile composes the same content vertically with visible actions.
The signature interaction is changing the cover with an immediate preview,
then publishing a personal monthly edition. No automatic public publication.
The approved plan and explicit monthly-cover choice are the implementation
authority; build code-led using catalog artwork and deterministic fixtures.

Profile navigation: Profile, Lists, Reviews, Diary, More. All existing archive
URLs and individual privacy controls survive. New discussion ships only with
blocking/reporting/moderation. No messaging, clubs, leaderboards or player work.

Acceptance and rollout boundary: [delivery record](../audits/taste-publication-2026-10-22.md).
The implementation is accepted locally with deterministic fixtures; production
activation requires its additive migrations and matching API/web release.
