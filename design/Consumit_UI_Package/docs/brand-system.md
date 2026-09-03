# Consumit — Active Brand System

## Project identity

- Product: Consumit, a social streaming platform for movies and TV shows.
- Platform: responsive web application; desktop design begins at 1440 px.
- Core promise: watch immediately, remember what you love, and discover through people whose taste you trust.
- Primary home action: play a strong recommendation.
- Social differentiator: profiles are living taste spaces with favorites, diary, ratings, lists, friends, and activity—not account settings pages.
- Inspiration adopted: Netflix's playback clarity, Shahid's cinematic editorial confidence, and Letterboxd's identity/community value.
- Avoid copying: Netflix red/black trade dress, Shahid layouts, Letterboxd green/orange marks, poster-wall-only homepages.
- Voice: concise, cinematic, warm, taste-aware.
- Visual thesis: cinema after midnight—editorial, intimate, and alive with other people's taste.
- Visual adjectives: cinematic, editorial, human.
- Anti-traits: generic, glossy-tech.

## Foundation tokens

| Role | Value | Usage |
|---|---|---|
| Canvas | `#09090B` | Main background |
| Surface | `#121215` | Panels and dense UI |
| Surface raised | `#19191E` | Selected states |
| Ink | `#F4F0E8` | Primary text and light action |
| Muted ink | `#AAA7A1` | Metadata and secondary copy |
| Signal orange | `#FF5D38` | Brand line, active states, ratings |
| Social lilac | `#A79CFF` | Future social/taste accents only |
| Positive | `#B8D86D` | Online/presence/success only |

## Type and geometry

- Display: Bitstream Charter, editorial serif, regular weight.
- Interface: DejaVu Sans, compact and direct.
- Base spacing: 4 px; primary rhythm 8 / 12 / 18 / 24 / 32 / 48 / 64.
- Desktop content margin: 62 px.
- Radius: 4 px micro, 7–8 px controls/cards; circles only for people and progress.
- Borders: 1 px warm-white at 8–16% opacity.
- Shadows: reserved for artwork separation; interface components stay flat.

## Asset language

- Cinematic stills use warm ember light, deep near-black shadow, rain/grain, and strong silhouettes.
- Posters may vary by title but keep controlled grain and one dominant composition.
- Crop people with intent; avoid generic centered headshots.
- Repeated motif: thin signal-orange line representing the path from taste to play.

## Component registry

| Component | Anatomy | Key states |
|---|---|---|
| Global navigation | Consumit mark, primary destinations, universal search, profile | active route uses bottom signal line |
| Primary play button | play icon + label | ivory fill, dark ink |
| Save control | plus/bookmark action | outline, saved state to be defined |
| Taste Match | vertical signal meter, score, human explanation | score + social reason |
| Content card | poster, contextual tag, friend rings, title, metadata | default, hover, watched, saved |
| Friend presence | overlapping avatar rings | 1–3 visible, overflow count later |
| Activity item | avatar, action sentence, title, rating/list detail | watch, rate, review, list |
| Continue card | landscape still, centered play, progress, title, remaining time | movie and episode |
| Editorial feature | cinematic art, taste reason, title, synopsis, play, social proof | personalized feature |
| Trending card | large rank, poster, member score, completion proof | rank 1–5 |
| Curated list card | visual collage, curator, editorial title, saves | friend-made lists |
| Mood selector | colored signal, human mood label | preset and personalized surprise |
| Footer | compact mark, support/legal links, copyright | desktop |
| Profile masthead | cinematic banner, avatar, identity, bio, stats, relationship actions | public profile |
| Taste compatibility | signal rail, overlap score, human explanation, mutuals | visitor-to-profile comparison |
| Diary row | date, artwork, title, rating, context, review action | first watch, rewatch, watched together |
| Taste signature | editorial taste sentence, favorite worlds, rating behavior | public summary |
| Rating rhythm | restrained rating distribution | half-star to five-star scale |
| Title masthead | cinematic artwork, metadata, synopsis, playback and social actions | film and series detail |
| Member pulse | community average, rating volume, distribution | title detail |
| Cast card | restrained portrait, person, role | cast and crew |
| Trusted reaction | friend identity, rating, editorial review excerpt, engagement | title detail |
| Watch header | Consumit mark, back action, title context, exit action | first-party player page |
| Consumit Player | semantic native media surface with first-party play, seek, volume, and fullscreen controls | ready, playing, paused, unavailable |
| Source selector | source health, selected state, recommended state, backups, reload | provider switching |
| Playback report | concise issue explanation and report action | wrong title, broken video, subtitle issue |
| Playback trust note | safety guidance for authorized direct-media playback | first-party player page |
| Season selector | season label, episode count, release state | active season, completed season, upcoming season |
| Episode row | episode still, number, title, runtime, synopsis, action | unwatched, in progress, watched, upcoming |
| Series progress rail | completed count, current episode, remaining time, continue action | fresh, active, season complete |
| Release schedule | cadence, next release, notification state | notifications on or off |
| Search query field | search icon, natural-language query, clear action, submit action | idle, focused, populated, loading |
| Result scope tabs | all, movies, series, people, lists | active scope uses signal line |
| Search filter rail | type, genre, runtime, decade, friend signal, availability | default, selected, reset |
| Top-match result | taste rank, title metadata, synopsis, title action, friend proof, cinematic still | personalized search lead |
| Member search card | identity, activity volume, taste-overlap rail, shared taste sentence, follow action | unfollowed, followed |
| Library masthead | archive label, personal summary, discovery action, edit action, saved/favorite/list counts | populated personal library |
| Library tabs | saved, favorites, watch history, personal lists, item counts | active tab uses signal line |
| Library toolbar | in-library search, type filters, watch-state filter, sort, view toggle | default, filtered, searching |
| Saved-title card | artwork, library state, title metadata, contextual signal | unwatched, in progress, favorite, new episode |
| Library pulse | untouched ratio, dominant taste world, friend-overlap proof | populated summary |
| Friends masthead | circle framing, discovery action, invite action, avatar cluster, weekly activity summary | populated following network |
| Activity filters | all, watched, rated, reviews, lists | active filter uses ivory fill |
| Social feed card | member identity, activity verb, title/list media, optional commentary, engagement and destination action | review, list update, rating, completed watch |
| Circle pulse | most discussed title, rating consensus or disagreement, compact signal rails | active social summary |
| Friend request row | identity, taste overlap, mutual count, response action | pending, accepted, dismissed |
| Follow suggestion row | identity, taste overlap, taste shorthand, follow action | unfollowed, followed |
| List masthead | list type, editorial title, description, curators, primary save action, list statistics, artwork collage | public, private, collaborative, saved |
| List detail tabs | titles, notes, activity, comments | active tab uses signal line |
| Ordered title row | rank, artwork, title metadata, curator note, taste/friend signal, title destination, library state | movie, series, saved, unsaved, new episode |
| Curator panel | owner, collaborators, contribution counts, follow action | owner-only, collaborative |
| List signals | personalized match, friend saves, completion proof | populated list summary |
| List activity timeline | ordered edit event, author, relative time | add, remove, reorder, note, milestone |
| List comment card | member identity, role, comment, engagement | member, curator, spoiler-hidden |
| Authentication shell | cinematic brand panel, focused form panel, support and privacy context | sign in, create account, recovery |
| Social authentication button | provider mark, clear provider label | Google, Apple, loading, unavailable |
| Authentication field | persistent label, text value or helper, inline validation | empty, focused, valid, invalid, disabled |
| Authentication trust note | privacy or control statement beside the decision | signup and sign-in reassurance |
| Onboarding header | Consumit mark, semantic step count, progress rail, optional skip | steps 1–3, completed |
| Import option card | import source, included data, time expectation, file action, privacy explanation | idle, selected, importing, success, failure |
| Selectable title card | artwork, title metadata, selection control | selected, unselected, imported preference |
| Starting taste summary | minimum count, progress, impact explanation, selected title list, continue action | incomplete, ready |
| Onboarding member row | member identity, activity volume, taste overlap, taste shorthand, follow action | suggested, following |
| Starting feed preview | followed-member activity transformed into a real destination | review, rating, list |
| Profile owner masthead | public identity, visibility state, edit action, visitor preview, share action | owner, public, private |
| Owner control panel | profile completeness, next improvement, privacy controls, visitor preview | incomplete, complete |
| Section management action | shared section heading plus edit, create, or manage action | favorites, diary, reviews, lists, friends |
| Editable diary row | shared diary content plus owner edit and review destinations | watched, reviewed, draft review |
| Profile pulse | private follower growth, list saves, activity destination | owner-only, populated, quiet |
| Settings rail | owner identity, settings destinations, connected-service summary, help access | active destination, connected services |
| Settings section | editorial heading, plain-language helper, grouped controls, contextual action | account, privacy, playback, language, notifications, data |
| Segmented privacy control | one visible choice from public, friends, or private | public, friends, private |
| Preference toggle row | setting label, human consequence, restrained switch | on, off, unavailable |
| Streaming service selector | service identity, selection state, availability-only explanation | selected, unselected, unavailable |
| Playback behavior panel | source rule, source memory, failure recovery, adapter-boundary note | automatic, remembered source, manual |
| Subtitle priority control | ordered language choices, reorder action, provider limitation note | populated, reordered, unavailable |
| Help search hero | human-language search field, example query, system-health signal | idle, populated, no result |
| Help topic card | semantic icon, problem family, answer count, destination | playback, subtitles, account, library, imports, discovery |
| Help answer row | specific question, one-line outcome, disclosure action | collapsed, expanded |
| Source health summary | live source labels, semantic health signals, status destination | healthy, slow, unavailable |
| Issue type selector | mutually exclusive report categories with plain labels | selected, unselected |
| Diagnostic context panel | title or episode, source, browser, region, request identifier | captured, partial, unavailable |
| Evidence dropzone | screenshot or short recording action, type and size guidance | empty, uploading, attached, rejected |
| Diagnostic consent | explicit technical-data toggle plus exact exclusions | on, off |

## Page grammar

- Stable top navigation at 84 px on desktop.
- Home hero uses one cinematic title, one primary action, one explanation of personal fit.
- Discovery rows are editorially named and may incorporate social proof directly on cards.
- Profile and social screens use richer text/list compositions; do not reduce everything to rounded card grids.
- Consumit has no watch rooms, co-watching rooms, or watch-party features. Social activity supports discovery and taste, not synchronized playback.
- During playback, suppress global navigation, recommendations, reviews, friend activity, and promotional UI. Consumit owns the controls while authorized providers supply direct media through adapters.
- Series detail keeps season selection and watch state outside playback. Every playable episode opens the shared Consumit Player shell; unreleased episodes offer notifications instead.
- Search results lead with one confident top match, then expose filters and mixed result types. Taste ranking and friend proof explain why results appear without pretending the query is objective.
- My Library pulls unfinished titles above the archive, keeps saved/favorite/history/list modes in one system, and exposes filters before a large backlog becomes visual sludge.
- Friends activity is asynchronous and discovery-led: every review, rating, watch, or list update points toward a title, list, or member. It never implies rooms, live chat, or synchronized playback.
- List detail preserves curator order and commentary as part of the recommendation. Search helps locate an item, but never silently reorders the authored list.
- Authentication uses a cinematic split shell and asks only for account essentials. Social sign-in reduces friction but never hides email signup.
- Onboarding is optional, shows meaningful three-step progress, and only asks for choices that change the product: import history, seed taste, and seed the friend feed. The last action opens a usable home state.
- Profile owner view preserves the public-profile composition and taste story. Editing, privacy, completeness, and profile-pulse controls are explicit owner-only states and never appear to visitors.
- Settings uses a stable owner rail and groups controls by consequence, not implementation. Streaming subscriptions affect discovery availability; direct-source behavior, subtitle limitations, and data visibility are explained exactly where users choose them.
- Help resolves common playback, subtitle, account, library, import, and discovery problems before escalating. Live source health sits beside playback guidance so users can distinguish a local problem from a provider problem.
- Report Issue captures title or episode, source, browser, region, timing, and anonymous request context automatically. Diagnostic attachment remains explicit opt-in, states what is excluded, and never publishes ticket content to profiles or friend activity.
- Mobile will be composed separately, not shrunk from desktop.

## Decision log

- Removed viewing-room functionality globally. Affected screens: title masthead and all future playback/social surfaces.
- Retired iframe and embed playback. Consumit now provides a first-party player; authorized providers supply direct media through an adapter boundary.

## Screen inventory

| Screen | User job | Primary action | Status |
|---|---|---|---|
| Home / Discover — desktop | choose, resume, or socially discover something worth watching | Play now | full-page proposal, 1440 × 3200 |
| Public profile — desktop | understand a member's taste and decide whether to follow | Follow | full-page proposal, 1440 × 2760 |
| Title detail — desktop | decide whether to watch and begin playback | Play now | full-page proposal, 1440 × 2780 |
| Consumit Player — desktop | load an authorized source, recover from failures, and watch without distraction | Play in Consumit | ready-source proposal, 1440 × 1000 |
| Series detail — desktop | choose a season or episode, resume progress, and understand release timing | Continue episode | full-page proposal, 1440 × 3100 |
| Search / Explore — desktop | describe an intent, narrow results, and open a promising title, person, or list | View top match | populated-query proposal, 1440 × 2960 |
| My Library — desktop | resume, filter, and organize saved titles, favorites, history, and personal lists | Continue a saved title | populated-saved-tab proposal, 1440 × 3000 |
| Friends activity — desktop | understand what trusted people watched, rated, reviewed, and curated | Open a trusted recommendation | populated-following-feed proposal, 1440 × 3000 |
| List detail — desktop | understand a curated idea, browse its ordered titles, and decide whether to keep it | Save list | public-collaborative proposal, 1440 × 3000 |
| Sign in — desktop | return to an existing library and circle | Sign in | ready-to-submit proposal, 1440 × 1000 |
| Create account — desktop | create a private-by-default Consumit identity | Create account | valid-form proposal, 1440 × 1000 |
| Onboarding: history — desktop | decide whether to bring existing watch history | Choose import or start fresh | step 1 proposal, 1440 × 1000 |
| Onboarding: favorites — desktop | seed recommendations with meaningful favorites | Continue with five selections | step 2 ready proposal, 1440 × 1000 |
| Onboarding: circle — desktop | seed trusted social discovery and enter the product | Enter Consumit | step 3 ready proposal, 1440 × 1000 |
| Profile owner view — desktop | maintain a public taste identity, diary, lists, and circle without leaving the profile | Edit profile | populated-owner proposal, 1440 × 3000 |
| Settings — desktop | control identity, privacy, streaming availability, playback behavior, language, notifications, and account data | Save changes | populated-account proposal, 1440 × 3000 |
| Help Center — desktop | solve common problems quickly and understand current source health | Search help | healthy-system proposal, 1440 × 2600 |
| Report Issue — desktop | send an actionable playback or product report with captured technical context | Submit report | populated-video-failure proposal, 1440 × 1700 |

## Home page section order

1. Featured hero with Taste Match
2. From your circle
3. Continue watching
4. Personalized editorial feature
5. Trending tonight
6. Lists worth stealing
7. Mood entry points
8. Footer

## Next high-value screens

1. Notifications and release tracking
2. Account settings and provider preferences
3. Import history management and migration states
4. Create and edit list flow
5. Password recovery and verification states
