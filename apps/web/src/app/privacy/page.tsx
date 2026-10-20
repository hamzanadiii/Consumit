import type { Metadata } from 'next'

import { LegalDocument, LegalLink, LegalNotice, LegalSection } from '../legal/legal-document'
import { AnalyticsPreferences } from '../shared/google-analytics'

export const metadata: Metadata = {
  title: 'Privacy Policy · Consumit',
  description: 'What Consumit collects, why it collects it, and the control you keep over your data.',
  robots: { follow: true, index: true },
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      intro={<>This Privacy Policy explains what Consumit collects, why, and the control you keep over it. Consumit is built to collect only what it needs to run your account and your library.</>}
      title="Privacy Policy"
      lastUpdated="October 19, 2026"
    >
      <LegalSection id="privacy-collect" number={1} title="Information we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-ink">Account data:</strong> your email address, username, and password, stored only as a secure hash.</li>
          <li><strong className="text-ink">Profile:</strong> username, display name, bio, avatar, banner, and separate visibility choices for Favorites, Ratings, Reviews, Lists, Network, Likes, Tags, and Watchlist. Profile identity is public, and those sections are visible by default. Consumit does not collect a profile location.</li>
          <li><strong className="text-ink">Library and viewing data:</strong> Watched titles, Diary, History, active playback, resume progress, ratings, reviews, lists, watchlist, favorites, Continue watching visibility, recommendation dismissals, and player/server preferences. Watched, Diary, History, active playback, resume progress, and account data are private. The other profile sections follow their individual visibility choices. Public Tags come from public Review records only, never private Diary entries.</li>
          <li><strong className="text-ink">Anonymous viewing trends:</strong> if you turn on the separate Settings option, playback progress from the last seven days can help rank title-level Home trends. The setting is off by default and independent of profile visibility. A title appears only after at least five opted-in members contribute; the trends read returns titles without member names, viewer counts, or live status. Turning it off removes your contribution from subsequent results.</li>
          <li><strong className="text-ink">Technical data:</strong> session state, security-relevant request details such as IP address and origin, and aggregated performance measurements (web vitals). There are no advertising identifiers.</li>
        </ul>
      </LegalSection>
      <LegalSection id="privacy-use" number={2} title="How we use it">
        <p>We use this information to authenticate you, keep your sessions secure, remember where you stopped watching, render your library and public profile sections, diagnose playback failures, and understand aggregate performance. Anonymous viewing trends use only the recent progress of members who opt in and expose qualifying titles without account identity. We do not use your viewing data to build advertising profiles. Browse-only pop-under advertising is served by our advertising partner profitableratecpmnetwork, which may use its own cookies as described in section 5.</p>
      </LegalSection>
      <LegalSection id="privacy-playback" number={3} title="Playback and third-party sources">
        <LegalNotice>Consumit does not host any media. When you press Watch, your browser requests the video from a configured third-party source, sometimes through Consumit&rsquo;s relay.</LegalNotice>
        <p>Because your browser connects to those servers directly, <strong className="text-ink">the source sees your IP address</strong> and is governed by its own privacy policy, which we do not control. If you want to keep your address away from third-party hosts, use a reputable VPN.</p>
      </LegalSection>
      <LegalSection id="privacy-sharing" number={4} title="Sharing and security">
        <p>We never sell, rent, or trade your personal information. Profile identity and visible taste sections can be read by visitors. A public list can be read by link only while both that list and your Lists section are public. A member&apos;s Saved Lists are private. If someone saves one of your public lists, their bookmark follows your edits; if you make the list private, delete it, or close your account, their bookmark can remain in that member&apos;s account as an unavailable reference until they remove it. Anonymous bookmark totals may rank qualifying public lists in Home&apos;s Popular with members row; the row shows no bookmarker identities or counts. Data is also shared with the infrastructure that runs Consumit (hosting, database, cache, and email delivery), with catalog APIs that receive ordinary metadata requests, with Google for optional analytics when you allow it, or when a lawful request requires it.</p>
        <p>Passwords are hashed with Argon2id, sessions use opaque tokens, and mutations require a verified origin. No method of transmission over the internet is 100% secure.</p>
      </LegalSection>
      <LegalSection id="privacy-storage" number={5} title="Local storage and cookies">
          <p>Consumit uses a session cookie to keep you signed in and local storage for device preferences such as theme and the pop-under frequency limit. On public browsing pages, the pop-under partner loads a third-party script that can open advertising windows and may set its own cookies to serve and measure ads. Those cookies are governed by the partner&rsquo;s own privacy policy, not this one. Pop-under ads start On by default and are limited to four per rolling 30 minutes, with at least five minutes between them on each device. Settings → Browsing &amp; advertising → Ad status lets you turn them Off; your device applies the choice immediately and members sync it privately to their account. Watch, Settings, Admin, sign-in and onboarding do not load the Consumit pop-under script. External players may still show their own ads or open popups under the provider&rsquo;s controls and your browser settings.</p>
      </LegalSection>
      <LegalSection id="privacy-choices" number={6} title="Your choices">
        <p>From Settings you can export the data held for your account, change your password, hide or show each public profile section, opt in or out of anonymous viewing trends, or close your account and delete its account records. Saved list references in other members&rsquo; accounts can remain unavailable until they remove them. Profile visibility does not enable trends. New lists are public by default, and you can choose Private when you create or edit a list. For any other data question, <LegalLink href="/report-issue">contact us through the report form</LegalLink> or start with the <LegalLink href="/help">Help Center</LegalLink>.</p>
      </LegalSection>
      <LegalSection id="privacy-analytics" number={7} title="Optional analytics">
        <p>If you allow analytics on this device, Google Analytics 4 uses first-party cookies to measure visits to public browsing pages, approximate location, device and browser information, and the referring website. Google receives your browser&rsquo;s network request, including your IP address. Consumit sends grouped page names and referring origins, excluding search text, URL queries and fragments, usernames, email addresses, private library activity, and playback sources or watch history. Advertising personalization and Google Signals are disabled.</p>
        <p>Analytics stays off until you choose Allow analytics. Your choice is stored on this device; if storage is unavailable, it lasts for this visit. Declining later stops collection and clears Consumit&rsquo;s Google Analytics cookies on this host; it does not delete information already collected by Google. Blocking analytics does not affect browsing or playback. See <LegalLink href="https://policies.google.com/privacy">Google&rsquo;s Privacy Policy</LegalLink>.</p>
        <AnalyticsPreferences />
      </LegalSection>
    </LegalDocument>
  )
}
