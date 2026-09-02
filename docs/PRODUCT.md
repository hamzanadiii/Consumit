# Product foundation

## Product definition

Consumit is a cinematic social streaming and taste-discovery product for movies and series. Its promise is: **watch immediately, remember what you love, and discover through people whose taste you trust.**

The product combines four jobs:

1. Help a member confidently choose what to watch.
2. Start playback with as little friction as possible.
3. Preserve history, progress, favorites, ratings, reviews, and lists.
4. Turn trusted people's activity into useful discovery.

Consumit is a media platform with a social/product layer, not a website organized around provider-specific scrapers. Where legally and technically appropriate, Consumit resolves and manages playback while media bytes travel directly from an authorized provider or CDN to the browser.

## Product principles

- **Taste before volume.** Explain why a recommendation fits instead of presenting an undifferentiated poster wall.
- **Playback before promotion.** The path from a title to a playing source is the primary product path.
- **People are discovery signals.** Profiles, reviews, ratings, diary entries, and lists lead to useful titles and members.
- **Progress belongs to the member.** History and resume position remain stable when the playback source changes.
- **Provider failure is normal.** Recovery should feel like source switching, not a technical error dump.
- **Privacy has a visible consequence.** Public, circle-only, and private choices explain who can see what.
- **Editorial, human language.** Product copy is concise, cinematic, warm, and taste-aware.

## Core experience loops

### Discover and watch

`Home/Search/Profile/List -> Title -> Watch / Embed -> Progress -> Resume`

The member sees a confident recommendation, understands the personal or social reason, opens its detail, and starts a valid source. If that source fails, Consumit offers or performs a fallback without losing progress.

### Remember and express taste

`Watch -> History/Diary -> Rating/Review -> Favorites/Lists -> Profile`

Watching is retained independently of the provider. Explicit choices improve the member's profile and future discovery.

### Discover through people

`Circle activity -> Title/List/Profile -> Follow/Save/Watch -> New activity`

Social activity is asynchronous and discovery-led. It does not imply live chat or synchronized viewing.

## Active desktop screen inventory

The design manifest defines 18 active desktop references:

1. Home / Discover
2. Public Profile
3. Profile Owner View
4. Settings
5. Title Detail
6. Watch / Embed
7. Series Detail
8. Search / Explore
9. My Library
10. Friends Activity
11. List Detail
12. Sign In
13. Create Account
14. Onboarding — History
15. Onboarding — Favorites
16. Onboarding — Circle
17. Help Center
18. Report Issue

Other screen files may be present in the package. A file becomes active only when added to the manifest; the archived custom-player concept remains historical.

These screens describe the intended product surface, not an automatic first-release commitment. The implementation sequence is in [DELIVERY.md](./DELIVERY.md).

## Home composition

The active desktop home reference uses this order:

1. Featured hero with Taste Match
2. From your circle
3. Continue watching
4. Personalized editorial feature
5. Trending tonight
6. Lists worth stealing
7. Mood entry points
8. Footer

## Confirmed scope constraints

- Watch rooms, co-watching rooms, and watch parties are excluded.
- Streaming-service choices are availability preferences, not connected billing accounts.
- The archived custom-player concept is not an active screen.
- The active playback design is the focused Watch / Embed shell. Provider controls remain inside the provider frame.
- Global navigation, recommendations, reviews, circle activity, and promotions stay out of active playback.
- Mobile layouts will be composed intentionally; desktop screens will not simply be shrunk.
- Provider integrations use sources Consumit is legally and contractually permitted to expose.

## Visual direction

The visual thesis is **cinema after midnight**: editorial, intimate, and alive with other people's taste.

| Role | Value |
|---|---|
| Canvas | `#09090B` |
| Surface | `#121215` |
| Raised surface | `#19191E` |
| Primary ink | `#F4F0E8` |
| Muted ink | `#AAA7A1` |
| Signal orange | `#FF5D38` |
| Social lilac | `#A79CFF` |
| Positive | `#B8D86D` |

- Display type: Bitstream Charter
- Interface type: DejaVu Sans
- Base spacing: 4 px; primary rhythm: 8 / 12 / 18 / 24 / 32 / 48 / 64

The complete module registry, page grammar, assets, tokens, and screen dimensions live in [`design/Consumit_UI_Package/docs/brand-system.md`](../design/Consumit_UI_Package/docs/brand-system.md). Its [`manifest.json`](../design/Consumit_UI_Package/manifest.json) is the authority for active and deprecated screens.

## Near-term product gaps

- Notifications and release tracking
- Import history management and migration states
- Create/edit list flows
- Password recovery and verification states

Account settings and provider preferences already have an active desktop reference, despite also appearing in the package's historical “next” list.
