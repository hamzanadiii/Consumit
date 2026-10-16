# Consumit: restrained Adsterra placement proposal

Date: 2026-10-04. Status: original placement recommendation. Layout-only placeholders were subsequently added and expanded at the member's request; current locations and limits are recorded in [DESIGN.md](../../DESIGN.md). No ad-serving scripts or tracking are enabled.

The member job is choosing and watching a title with minimal interruption. Monetize natural pauses in browsing, preserving the existing hero, Continue watching, playback actions and personal library. These placements are recommendations based on Consumit's shipped screen structure; they are not claimed to reproduce Letterboxd's exact current ad map or to maximize revenue.

## Start with one slot per browsing page

| Surface | Desktop placement | Mobile placement | Format |
| --- | --- | --- | --- |
| Home | After Trending Series, before Trending Anime; leave the hero, Continue watching and first two trending shelves together. | Same section break. | 728×90 desktop; 320×50 mobile. |
| Movies / Series catalogs | One full-width break after two complete poster rows: 12 titles at six columns, eight at four columns. Never replace a poster with an ad. | After four complete rows, eight titles at two columns. | 728×90 desktop; 320×50 mobile. |
| Movie / Series detail | One optional 300×250 unit in a new right column beside Overview below the hero. For series, Overview follows Episodes, keeping episode selection first. | One optional 320×50 unit before Related, after the main information and actions. | 300×250 desktop; 320×50 mobile. |

The detail hero already has a 340px member-action column. Putting an ad below that panel inside the hero would enlarge the hero and crowd its main actions; the proposed rectangle belongs below the hero instead. This placement needs a small layout change when implemented.

Begin with Home and catalogs, then evaluate the optional detail slot. Do not repeat a banner after every infinite-scroll page, filter change or episode row. Do not load both the desktop and mobile unit and merely hide one.

## Presentation

- Use a quiet **Advertisement** label above a centered unit, 24–32px of separation from content, and the existing page surface. No bright frame, shadow or placeholder animation around advertising.
- Reserve the exact pixel dimensions before the script loads to avoid shifting the page. Keep fixed banners at their supplied dimensions. Use 468×60 for intermediate widths if requested; omit the slot if no configured unit fits its actual container. A 320px-wide screen can have less than 320px of usable content width.
- Load a below-the-fold unit near visibility rather than during the critical hero/player preparation work. Keep each instance bounded to its own slot and a separate provider code when there are distinct units.
- Keep Home hero, Continue watching, navigation, search controls, Play buttons, subtitles and all player controls clear. Start with Watch, authentication, Settings and personal library archives ad-free.
- Use ordinary display banners first. Native blocks can be considered later below Related, clearly separated and labelled Sponsored; they must not look like catalog recommendations or episode cards.
- Do not add Popunder, Social Bar, floating/sticky banners, countdowns or full-page blockers for this rollout. Avoid flashing creatives, sound and deceptive Play/download buttons. Turn off Adult inventory where the publisher controls allow it, and confirm any other desired exclusions with Adsterra rather than assuming dashboard switches exist.

## Evidence and limits

[Adsterra's banner product page](https://adsterra.com/banner-ads/) lists 160×300, 160×600, 300×250, 320×50, 728×90 and 468×60 units. [Its publisher banner guide](https://adsterra.com/blog/how-banner-ads-make-money/) says standard banners do not resize responsively and advises against overlapping content, clustering banners, or reusing a single banner code twice. The device/container selection above is our implementation recommendation.

[Adsterra's native guide](https://adsterra.com/blog/turn-a-profit-with-native-banners/) describes responsive native blocks and customization of composition, fonts and colors. A default multi-ad widget does not automatically match Consumit's cinematic design; it is deferred here.

[Letterboxd Pro](https://letterboxd.com/pro/) documents removal of third-party ads. This supports its ad-supported/ad-free distinction, not a specific placement or density. Exact official public placement evidence is limited; see [the source audit](./ad-placement-sources-2026-10-04.md).

[The Coalition for Better Ads](https://www.betterads.org/standards/) identifies popups, autoplay with sound, disruptive interstitials, large sticky formats and other intrusive experiences as poorly accepted. Our one-slot starting limit is intentionally conservative and is not presented as a universal standard or guaranteed revenue optimum.

## Evaluate before adding another slot

Compare the initial slots against the current ad-free experience: title-to-play conversion, resume usage, browsing exits, layout stability, loading time, and net ad revenue per visit. Review mobile separately and inspect actual creatives. Expand only if the browsing and playback experience remains acceptable; no income estimate is supportable without real traffic and campaign data.

Implementation entry points: `apps/web/src/app/home/filscreen-home.tsx`, `apps/web/src/app/catalog/catalog-browse-content.tsx`, and `apps/web/src/app/catalog/detail-screens.tsx`. A reusable bounded ad slot would be a later implementation slice. This proposal does not change the product contract or enable live advertising.
