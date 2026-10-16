# Display ad placement: primary-source findings

Researched: 2026-10-04. Scope: evidence for future low-annoyance Adsterra placements in Consumit's catalog and discovery surfaces. No ad scripts, publisher-account changes, or application edits.

## Letterboxd: documented facts and limits

- Letterboxd's [paid-subscription page](https://letterboxd.com/about/pro/) lists removal of third-party ads and associated tracking as a Pro benefit. Its [FAQ](https://letterboxd.com/about/faq/?s=member+give+gift) says free members see third-party advertising on its website and apps.
- Letterboxd's [contact page](https://letterboxd.com/contact/) provides `ads@letterboxd.com` for advertising enquiries. This is an enquiry route, not a published placement specification.
- The official [2012 public-beta announcement](https://embed.letterboxd.com/journal/public/) describes introducing a small amount of display advertising. This establishes historical use, not current density or placement.
- Letterboxd's advertising partner describes native, interstitial, rewarded, and playable app formats in its [Playwire app case study](https://www.playwire.com/app-case-studies/letterboxd). This is primary partner evidence, not an independent UX assessment or a current page-by-page inventory. Letterboxd's [privacy notice](https://letterboxd.com/legal/privacy-notice/) identifies Playwire among its advertising service providers.

**Evidence limit:** No publicly accessible official Letterboxd media kit or exact website placement map was located in this research. An advertising directory listed display sizes, but it was excluded because it is not a primary source. No actual ad placements were visually verified. Do not say Letterboxd always uses a particular sidebar, leaderboard position, ad density, or only unobtrusive formats. A restrained editorial presentation is a Consumit design recommendation, not a verified description of every Letterboxd ad experience.

## Adsterra: documented capabilities

| Topic | Confirmed evidence |
| --- | --- |
| Fixed display sizes | **160×300, 160×600, 300×250, 320×50, 728×90, 468×60**. Display banners do not automatically resize for mobile. [Publisher Help Center: Selecting the Right Ad Unit](https://help-publishers.adsterra.com/en/articles/5210727-selecting-the-right-ad-unit). |
| Device-specific units | Adsterra recommends a **728×90 desktop / 320×50 mobile** combination and documents switching sizes by device. Its example hides units with CSS; a future SPA integration should evaluate loading only the eligible unit. [Displaying Different Banners on Mobile and Desktop](https://help-publishers.adsterra.com/en/articles/9571958-displaying-different-banners-on-mobile-and-desktop), dated 2024-07-08. |
| Native customization | Native banners are responsive; publishers can choose layout, font size, and color. Mobile-specific customization or custom CSS is available through support. [Selecting the Right Ad Unit](https://help-publishers.adsterra.com/en/articles/5210727-selecting-the-right-ad-unit). The [native-banner guide](https://adsterra.com/blog/turn-a-profit-with-native-banners/) also documents composition/alignment controls and manager-assisted customization. |
| Category controls | An ad unit determines format, **not** the category of ads served. The current Help Center explicitly documents enabling/disabling Adult ads. [Adding a Website](https://help-publishers.adsterra.com/en/articles/5056373-adding-a-website) and [Managing Your Websites](https://help-publishers.adsterra.com/en/articles/5056395-managing-your-websites), both dated 2026-05-15. |
| Exclusion uncertainty | The native guide mentions excluding some ad types without enumerating current controls. The [publisher setup guide](https://adsterra.com/blog/set-up-publishers-dashboard/) says enabling BOOST CPM allows all ad types. Do not promise separate gambling, software, sound, or alert exclusion switches without checking the current account/support. |

## Consumit recommendation: UX inference

Start with **one in-flow slot per eligible page**, as a conservative experiment rather than a proven annoyance threshold:

1. **Home:** a 728×90 slot after Trending Series, preserving the hero, Continue watching, and initial discovery shelves; use 320×50 on narrow layouts.
2. **Catalog/Search:** a separate full-width slot after two complete desktop rows or four mobile rows. Keep it out of the first results and never disguise it as a title card.
3. **Title Detail, optional later:** one 300×250 slot beside Overview below the hero on wide screens; on Series, Overview follows Episodes. Use only when there is adequate space. Do not enlarge the existing hero or place it beside Play/Continue watching.

Keep Watch, private library/profile archives, authentication, onboarding, settings, forms, and failure/recovery screens clean initially. Avoid sticky overlays, popunders, interstitials, auto-playing audio, and ads that resemble Play, download, player updates, or system warnings. These are product choices for the requested low-annoyance experience; vendor marketing does not establish that a format is non-annoying.

Use an explicit **Advertisement** label, reserve the chosen dimensions before loading, request the correct fixed size instead of shrinking/cropping the creative, and keep navigation and title actions independent of ad loading. Review real creative behavior across devices before any launch; layout alone cannot guarantee a quiet ad experience. Measure Watch starts, page abandonment, layout shifts, and complaints alongside revenue before expanding density.

## Product boundary

[PRODUCT.md](../PRODUCT.md) currently defers ads and requires uninterrupted member-controlled Watch. This note is research for a future product decision. Any implementation slice must update the relevant product decision at its source of truth. External sources and account controls can change; these findings do not verify current fill, creative quality, revenue, or Letterboxd's complete live inventory.
