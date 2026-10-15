---
version: 1
slug: "apps-web-src-app-page-tsx"
primary_target: "apps/web/src/app/page.tsx"
related_targets: ["apps/web/src/app/home/filscreen-home.tsx","apps/web/src/app/home/filscreen-shell.tsx"]
---

# Consumit Home / Cinema After Midnight

**Scope:** Keep the existing FilScreen home and its near-black, signal-orange visual identity.  
**Mode:** Operate.  
**Audience:** Members and guests browsing movies, series, and anime; members also see their viewing progress and real Circle activity.  
**Job and action:** Find a title, use Watch or More info, and continue through the catalog rails.  
**Proof/content:** Real catalog artwork and metadata, actual Circle activity when available, and actual member progress; never fabricate members or availability.  
**Constraints:** Match the user's existing dark/orange Home screenshot; preserve the sidebar, kind tabs, rotating hero, catalog rails, Continue watching, Circle activity, and shared first-party playback behavior.  
**Unresolved:** None for the visual direction.

## Direction contract

**THESIS:** Consumit feels like a cinematic catalog after midnight: a near-black room, warm ivory type, restrained signal orange, strong artwork, and compact controls.

**OWN-WORLD:** Charcoal-black surfaces, warm ivory content, orange active states, and scarce lilac and lime semantic signals. The collapsible left rail, compact top tabs, cinematic hero, and horizontal title rails carry the same identity across the app.

**STORY:** The visitor scans the featured title, chooses Watch or More info, then browses or resumes titles. Playback stays in the Consumit Player; watch progress belongs to the title/episode; a deliberate diary, review, or list action carries the member's taste back into Consumit.

**FIRST VIEWPORT:** A narrow sidebar anchors the left edge. New, Series, Movies, Anime, and API tabs share the top row with search, notifications, and the member avatar. A broad backdrop hero fills the first screen with title copy and Watch / More info actions; Continue watching and the category rails follow below.

**FORM:** The user confirmed the existing Cinema After Midnight interface as the target; restore its shipped code-led composition and remove the blue/gold Film Society variant.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Owner-confirmed interface refinement — 2026-10-15

The owner confirmed one Consumit Server group that opens its existing provider choices and separate named external players. Episodic playback preferences sit directly below the picture. The recommendation row uses compact grouped filters, corner dismissal actions and visible phone titles. The welcome dialog follows the supplied centered share/support references within Consumit tokens. Controlled desktop/touch review and source regression evidence are recorded in docs/audits/interface-refinement-2026-10-15.md. This is a refinement of the incumbent world; the retained player controls and approved cinema topology remain the visual authority.


## Browsing notification correction — 2026-10-15

The owner moved ad-settings and feedback content out of the welcome card. One nonmodal browsing notification appears at a time after welcome dismissal, using existing Consumit tokens, explicit close/action controls and device-local persistence. No Watch interruption or replacement visual world. Desktop and mobile local/deployed review passed; see docs/audits/browsing-notifications-2026-10-15.md.
