# Consumit

Consumit is a social streaming and taste-discovery product for movies, series, and anime. This glossary defines the product language used across design, product, and engineering.

## People and taste

**Member**:
A person with a Consumit identity, profile, library, and activity history.
_Avoid_: User, customer, account

**Account**:
The private access record through which a member authenticates and controls security and account-level settings.
_Avoid_: Member, profile

**Profile**:
A member's public or private expression of taste, including favorites, diary entries, ratings, reviews, lists, and circle.
_Avoid_: Account page

**Username**:
A member-chosen, unique public identifier used in profile links. A username may change, while the member identity remains stable.
_Avoid_: Handle, member ID

**Circle**:
The members a member chooses to trust for social discovery; their activity can influence recommendations and feeds. A circle is not a reciprocal friendship or a private communication channel.
_Avoid_: Friend list, network, chat

**Follow**:
A one-way relationship that adds another member to a member's circle.
_Avoid_: Friend request, connection

**Taste**:
A member's evolving preference profile, expressed through favorites, ratings, reviews, watch history, lists, and followed members.
_Avoid_: Profile data, preferences

**Taste Match**:
A personalized estimate of how well a title, list, or another member aligns with a member's taste, accompanied by a human-readable reason.
_Avoid_: Compatibility score, recommendation score

**Activity**:
A member-visible event created by watching, rating, reviewing, following, or curating a list.
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
The focused Consumit screen that contains the Consumit Player and provides automatic recovery, reporting, and trust guidance. Provider and source identities stay out of normal viewing controls.
_Avoid_: Watch / Embed, provider frame

**Consumit Player**:
The first-party playback surface through which a member watches a configured direct media source while keeping one consistent set of controls.
_Avoid_: Embed frame, provider player

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
