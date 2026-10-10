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
A member’s expression of taste, private until explicitly published. A public profile shares identity, bio, favorites, all ratings and reviews, and individually public lists; personal activity, location, watched archives, watchlist, likes, tags, history and progress stay private.
_Avoid_: Account page

**Username**:
A member-chosen, unique public identifier used in profile links. A username may change, while the member identity remains stable.
_Avoid_: Handle, member ID

**Circle**:
An archived social-discovery concept for followed members; it is outside the active product.
_Avoid_: Friend list, network, chat

**Follow**:
A one-way relationship to a public member profile. Sign-in is required to follow; becoming private retains the relationship but hides the member from public relationship lists and counts.
_Avoid_: Friend request, connection

**Network**:
The single profile tab that groups a member's Followers and Following collections, each selectable within the tab. It is distinct from the retired Circle feed.
_Avoid_: Friends, Circle feed, mutuals

**Taste**:
A member's evolving preference profile, expressed through favorites, ratings, reviews, watch history, and personal lists.
_Avoid_: Profile data, preferences

**Taste Match**:
A personalized estimate of how well a title, list, or another member aligns with a member's taste, accompanied by a human-readable reason.
_Avoid_: Compatibility score, recommendation score

**Activity**:
A personal event created by watching, rating, reviewing, or curating a list.
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
A title sourced from AniList, identified by AniList ID, with episodes organized by canonical episode number. Anime follows the movie/series classification for playback but has its own metadata domain (AniList), episode identity engine, and provider mapping system. Member records (saves, favorites, progress, ratings, reviews, diary) store anime under the same title kind as movies and series, keyed by AniList ID, so an anime and a TMDB title may share a numeric ID without colliding.
_Avoid_: Japanese animation, anime series

**Episode**:
A single playable installment of a series or anime, identified within a season (series) or by canonical number (anime).
_Avoid_: Video, chapter

**List**:
An intentionally ordered collection of titles curated by one or more members, optionally with notes and commentary.
_Avoid_: Playlist, collection

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
A member's written evaluation of a title, optionally paired with a rating.
_Avoid_: Comment, note

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
