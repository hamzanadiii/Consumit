# Consumit

Consumit is a streaming and personal taste-discovery product for movies, series, and anime. This glossary defines the product language used across design, product, and engineering.

## People and taste

**Member**:
A person with a Consumit identity, profile, library, and activity history.
_Avoid_: User, customer, account

**Account**:
The private access record through which a member authenticates and controls security and account-level settings.
_Avoid_: Member, profile

**Profile**:
A member’s public identity and selected expression of taste. Favorites, Ratings, Reviews, Lists, Network, Likes, Tags, Watchlist, Watched, Diary, History, and Activity are independently visible by default and can be hidden section by section. Active playback, resume progress, and account data stay private. Profile location is not collected.
_Avoid_: Account page

**Username**:
A member-chosen, unique public identifier used in profile links. A username may change, while the member identity remains stable.
_Avoid_: Handle, member ID

**Circle**:
An archived social-discovery concept for followed members; it is outside the active product.
_Avoid_: Friend list, network, chat

**Follow**:
A one-way relationship to an active member identity. Sign-in is required to follow. A member controls whether their Network section and relationship counts appear publicly.
_Avoid_: Friend request, connection

**Network**:
The single profile tab that groups a member's Followers and Following collections, each selectable within the tab. It is distinct from the retired Circle feed.
_Avoid_: Friends, Circle feed, mutuals

**Taste**:
A member's evolving expression through favorites, ratings, reviews, visible lists, and other individually published sections, including Watched, Diary, History, and Activity. Active playback and resume progress remain private records.
_Avoid_: Profile data, preferences

**Title Recommendation**:
A private title card a member sends to someone they currently follow. The recipient can Save, mark it Already seen, or choose Not interested. It carries no message, creates no public event, and does not open a private conversation.
_Avoid_: Direct message, public post

**List**:
A member-curated, ordered collection of titles with optional notes and a description. Public lists appear on profiles and discovery while the owner's Lists section is visible. Unlisted lists are available to anyone with the link and stay out of profiles and discovery. Private lists are limited to the owner and invited editors. Editors can change titles and order; only the owner can change visibility or delete the list.
_Avoid_: Playlist, shared document

**Saved List**:
A private bookmark to another member's original public or unlisted list. It follows edits by the curator; if the source becomes private or is deleted, the bookmark stays as an unavailable reference until the viewer removes it.
_Avoid_: Copy, collaborative list

**Popular with members**:
A Home row of public lists ranked by at least five distinct members' private Saved Lists bookmarks, excluding the curator. The row reveals the list and curator but never bookmarker identities or save counts.
_Avoid_: Popularity score, public save count

**Trending with members**:
A Home title row ranked from recent playback progress contributed by members who separately opt in to anonymous viewing trends. Results expose titles only, require at least five contributing members per title, and never show member names, viewer counts, or live status.
_Avoid_: Activity feed, live viewers

**Taste Match**:
A personalized estimate of how well a title, list, or another member aligns with a member's taste, accompanied by a human-readable reason.
_Avoid_: Compatibility score, recommendation score

**Activity**:
A profile archive of member-authored diary and review events. Its visibility is controlled independently from Watched, Diary, and History. Active playback and resume progress are never activity events.
_Avoid_: Feed item, notification

## Catalog and curation

**Title**:
A catalog work that is either a movie, series, or anime.
_Avoid_: Content, media item, video

**Movie**:
A title watched as one primary work.
_Avoid_: Film asset

**Series**:
An episodic title organized into seasons and episodes.
_Avoid_: TV item, show asset

**Anime**:
A title sourced primarily from AniList, identified by AniList ID, with episodes organized by canonical episode number. MyAnimeList and Kitsu can fill missing catalog metadata only when an exact mapping to the AniList title is available. Anime follows the movie/series classification for playback but has its own metadata domain, episode identity engine, and provider mapping system. Member records (saves, favorites, progress, ratings, reviews, diary) store anime under the same title kind as movies and series, keyed by AniList ID, so an anime and a TMDB title may share a numeric ID without colliding.
_Avoid_: Japanese animation, anime series

**Episode**:
A single playable installment of a series or anime, identified within a season (series) or by canonical number (anime).
_Avoid_: Video, chapter

**Saved Title**:
A title a member has bookmarked for later without promoting it as part of their identity.
_Avoid_: Favorite, watchlist item

**Favorite**:
A title a member explicitly chooses as a strong expression of taste.
_Avoid_: Saved title, liked title

**Rating**:
A member's numeric evaluation of a title.
_Avoid_: Score, reaction

**Review**:
A member's written evaluation of a title, optionally paired with a rating and exact series/anime episode context. Publishing a review does not log a watch. Its stable page retains the rating at publication and an optional spoiler warning; the current title rating can change independently.
_Avoid_: Comment, note

**Collection**:
The reading presentation of a List: an introduction, ordered titles and notes, optional chapters, cover artwork, and up to three genre tags. Collection, Ranking, and Watch order are presentation choices for the same List, not separate library records. The dedicated collection creation flow starts Private.
_Avoid_: Playlist, new catalog kind

**Private Draft**:
An unfinished member-authored review, watch log, collection edit, or monthly edition stored for its author. Saving a draft does not publish it or replace a published edition. Collection drafts require Save private draft; review and watch-log drafts also save while writing and on close.
_Avoid_: Published work, automatic activity

**Monthly Edition**:
A member-authored publication for one calendar month, with a title, introduction, optional cover, exactly three distinct picks and a reason for each, plus optional featured review and public list. It stays private until deliberately published; unpublishing preserves its editable draft.
_Avoid_: Automatic recap, listening report

**Taste Comparison**:
Exact title evidence shared by a signed-in viewer and another member: shared Favorites, titles both rated highly, and differing ratings. The visited member's section visibility controls eligible evidence. It carries no compatibility percentage or Taste Match score.
_Avoid_: Taste Match, member score

**Community**:
The active discovery surface for public collections and authored work from followed curators. Following contains published reviews, explicit collection updates, and monthly editions; it contains no automatic playback activity. Curator/list update notifications require a separate opt-in.
_Avoid_: Circle, live viewing feed

**Discussion**:
Comments and replies on reviews and lists, with spoiler disclosure, editing/deletion, muting, blocking, reporting and moderation. It is not a private messaging channel; monthly edition pages do not expose discussion.
_Avoid_: Review, chat

**Watch History**:
The factual record of titles and episodes a member has started or completed.
_Avoid_: Diary, activity feed

**Diary**:
The member-authored chronological record of completed watches and rewatches. An entry may retain an exact season and episode for series or anime.
_Avoid_: Watch history, activity log

**Library**:
A member's personal home for saved titles, favorites, watch history, and lists.
_Avoid_: Catalog, collection

**Import**:
A member-initiated transfer of records from an exported service archive into their Consumit profile and library.
_Avoid_: Account link, synchronization

## Discovery and playback

**Provider**:
An external, configured source that makes a title available for playback through Consumit.
_Avoid_: Host, scraper, streaming service

**Provider Role**:
An Admin assignment of Video source, Audio source, or Both. Video source and Both can supply the main stream and its bundled audio. Audio source excludes a provider from video selection. Audio source and Both opt the provider into separate-audio discovery for the titles it serves. A role is operator intent; it does not establish delivery health or compatibility with another recording.

**Provider Delivery Tier**:
A provider's explicitly configured route: Direct, Relay, or Embed. Direct and Relay use Consumit controls; Embed uses an external provider's player inside Watch and has no supported progress synchronization.

**Provider Embed**:
An external provider's playback surface inside Watch, with its own playback controls. It is distinct from the Consumit Player and from a public Consumit player embed.
_Avoid_: Consumit Player, public embed API

**Availability Preference**:
A streaming service a member selects to improve discovery and availability results; it is not a linked billing account.
_Avoid_: Connected account, subscription connection

**Source**:
A provider-specific playback option for a title or episode.
_Avoid_: Provider, URL

**Playback Session**:
One member's attempt to watch a particular movie or episode, retaining progress and recovery context independently of its current source.
_Avoid_: Stream, player instance

**Resolve**:
The act of finding, validating, and selecting a suitable source for a title or episode.
_Avoid_: Scrape, fetch URL

**Fallback**:
A replacement source selected after the current source becomes unavailable or unusable.
_Avoid_: Retry, refresh

**Cast**:
Sending the active playback session to a TV through Chromecast. The sender keeps the session, progress, and history; the TV only plays media and reports status.
_Avoid_: Stream to TV, mirror

**Receiver**:
The TV-side Consumit playback surface (a custom CAF app) that plays cast media and reports status. It never holds member identity or progress.
_Avoid_: Embed frame, provider player

**Delivery Failure**:
The recorded browser-side reason an active playback source failed, used to guide renewal, fallback, and provider reliability.
_Avoid_: Error message, failure detail

**Watch**:
The focused Consumit screen containing the Consumit Player or a configured Provider Embed. It keeps the exact title or episode and offers source selection and recovery.
_Avoid_: Watch / Embed, provider frame

**Consumit Player**:
The first-party playback surface through which a member watches a validated configured media source while keeping one consistent set of controls.
_Avoid_: Embed frame, provider player

**Consumit Server**:
The Watch selection group containing currently permitted Direct and Relay providers that use the Consumit Player. Opening it reveals individual numbered provider choices. External players remain separate named choices. This is a presentation group; provider media delivery, Admin recovery order and member progress ownership retain their existing boundaries.

**Provider Candidate**:
A reviewed, shipped adapter recipe available in Admin's isolated Provider scout. It is outside the live provider roster until an operator installs its approved base configuration. A successful exact-title test is evidence for that sample, not a guarantee of provider availability or recording compatibility.
_Avoid_: Verified provider, automatically discovered host

## Anime domain

**AniList**:
The primary metadata source for anime titles. AniList supplies search, details, relations, characters, staff, airing schedules, and franchise graphs. Consumit owns identity, episode mapping, playback, progress, provider reliability, subtitles, and taste.
_Avoid_: Anime database, metadata API

**Franchise Graph**:
A directed graph of anime relations (prequel, sequel, side story, spin-off, adaptation, source) derived from AniList relation edges, used to build watch order recommendations and related-title discovery.
_Avoid_: Relation tree, anime list

**Episode Identity Engine**:
The system that maps canonical anime episodes to provider-specific episode numbers, handling discrepancies in season numbering, split cours, absolute numbering, specials, and dub numbering.
_Avoid_: Episode mapper, provider matcher

**SUB / DUB**:
Audio language variants of the same anime title. SUB is original audio (typically Japanese) with subtitles; DUB is a translated audio track. Consumit treats these as playback variants of one canonical anime, not separate titles.
_Avoid_: Subbed, dubbed, version

**Canonical Episode**:
The definitive episode number for an anime as defined by AniList, used as the stable identity for progress tracking and provider mapping regardless of how individual providers number episodes.
_Avoid_: Episode number, absolute episode

**Tracked Title**:
A series or anime currently in a member's Watchlist, Favorites, or both. Removing it from both ends tracking; saving it again starts a new tracking period.
_Avoid_: Followed show, subscription

**Episode Release**:
A dated airing of an exact episode. An airing date does not establish that the episode can play on Consumit. Series retain their season and episode; anime retain their canonical episode.
_Avoid_: Available episode, playable release

**Playback Checked**:
Recent evidence that an exact episode decoded video, played, sought, and resumed in a particular playback environment. Evidence can expire or be invalidated; it does not promise permanent playback availability.
_Avoid_: Verified availability, guaranteed playback

**Episode Notification**:
A private historical reminder created after a new tracked episode passes a playback check, for a member who enabled reminders before its release. Reading or watching the episode does not remove the reminder.
_Avoid_: Airing alert, push notification

**People search**:
Discovery of active public members by username or display name, distinct from catalog title search.
_Avoid_: Account search, directory of all accounts

**Viewing Preferences**:
A viewer’s preferred audio, subtitles, quality, and next-episode behavior. A source may lack a preferred option without changing that preference. Enabled subtitles discover and select available languages in the viewer’s saved priority order; temporary fallback or missing tracks do not turn the saved preference off.
_Avoid_: Saved track IDs, guaranteed languages

**Welcome Guide**:
An optional introduction that lets guests and members choose Viewing Preferences, pick Favorites, and learn how to use Consumit. Dismissing the guide does not mean playback preferences were chosen.
_Avoid_: Required setup, automatic Favorites
