# Consumit

Consumit is a social streaming and taste-discovery product for movies and series. This glossary defines the product language used across design, product, and engineering.

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
A catalog work that is either a movie or a series.
_Avoid_: Content, media item, video

**Movie**:
A title watched as one primary work.
_Avoid_: Film asset

**Series**:
An episodic title organized into seasons and episodes.
_Avoid_: TV item, show asset

**Episode**:
A single playable installment of a series, identified within a season.
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
The member-facing chronological record of completed watches and rewatches.
_Avoid_: Watch history, activity log

**Library**:
A member's personal home for saved titles, favorites, watch history, and lists.
_Avoid_: Catalog, collection

## Discovery and playback

**Provider**:
An external, authorized source that makes a title available for playback through Consumit.
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

**Watch**:
The focused Consumit screen that contains the Consumit Player and provides source selection, recovery, reporting, and trust guidance.
_Avoid_: Watch / Embed, provider frame

**Consumit Player**:
The first-party playback surface through which a member watches an authorized direct media source while keeping one consistent set of controls.
_Avoid_: Embed frame, provider player
