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
      lastUpdated="October 15, 2026"
    >
      <LegalSection id="privacy-collect" number={1} title="Information we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-ink">Account data:</strong> your email address, username, and password, stored only as a secure hash.</li>
          <li><strong className="text-ink">Profile:</strong> display name, bio, avatar, banner, and your visibility preference.</li>
          <li><strong className="text-ink">Viewing data:</strong> watch progress, diary entries, ratings, reviews, lists, watchlist, favorites, Continue watching visibility, recommendation dismissals, and player/server preferences. This stays private to your account.</li>
          <li><strong className="text-ink">Technical data:</strong> session state, security-relevant request details such as IP address and origin, and aggregated performance measurements (web vitals). There are no advertising identifiers.</li>
        </ul>
      </LegalSection>
      <LegalSection id="privacy-use" number={2} title="How we use it">
        <p>We use this information to authenticate you, keep your sessions secure, remember where you stopped watching, render your library and archives, diagnose playback failures, and understand aggregate performance. We do not use your viewing data to build advertising profiles. Occasional banner advertising is served by our advertising partner highrevenueformat inside sandboxed frames, which may use its own cookies as described in section 5.</p>
      </LegalSection>
      <LegalSection id="privacy-playback" number={3} title="Playback and third-party sources">
        <LegalNotice>Consumit does not host any media. When you press Watch, your browser requests the video from a configured third-party source, sometimes through Consumit&rsquo;s relay.</LegalNotice>
        <p>Because your browser connects to those servers directly, <strong className="text-ink">the source sees your IP address</strong> and is governed by its own privacy policy, which we do not control. If you want to keep your address away from third-party hosts, use a reputable VPN.</p>
      </LegalSection>
      <LegalSection id="privacy-sharing" number={4} title="Sharing and security">
        <p>We never sell, rent, or trade your personal information. Data is shared with the infrastructure that runs Consumit (hosting, database, cache, and email delivery), with catalog APIs that receive ordinary metadata requests, with Google for optional analytics when you allow it, or when a lawful request requires it.</p>
        <p>Passwords are hashed with Argon2id, sessions use opaque tokens, and mutations require a verified origin. No method of transmission over the internet is 100% secure.</p>
      </LegalSection>
      <LegalSection id="privacy-storage" number={5} title="Local storage and cookies">
          <p>Consumit uses a session cookie to keep you signed in and local storage for device preferences such as theme. Banner advertising from our partner highrevenueformat loads inside sandboxed frames that run on a separate, isolated origin: the ad code cannot read Consumit pages, your session, or your local storage. The partner may still set its own cookies inside those frames to serve and measure ads; those cookies are governed by the partner&rsquo;s own privacy policy, not this one. Ads start On by default. Settings → Browsing &amp; advertising → Ad status lets you turn them Off without an ad blocker; your device applies the choice immediately and members sync it privately to their account. With ads Off, Consumit avoids automatic selection of external players that require unrestricted popup permissions.</p>
      </LegalSection>
      <LegalSection id="privacy-choices" number={6} title="Your choices">
        <p>From Settings you can export the data held for your account, change your password, adjust profile visibility, or close your account and delete its records. For any other data question, <LegalLink href="/report-issue">contact us through the report form</LegalLink> or start with the <LegalLink href="/help">Help Center</LegalLink>.</p>
      </LegalSection>
      <LegalSection id="privacy-analytics" number={7} title="Optional analytics">
        <p>If you allow analytics on this device, Google Analytics 4 uses first-party cookies to measure visits to public browsing pages, approximate location, device and browser information, and the referring website. Google receives your browser&rsquo;s network request, including your IP address. Consumit sends grouped page names and referring origins, excluding search text, URL queries and fragments, usernames, email addresses, private library activity, and playback sources or watch history. Advertising personalization and Google Signals are disabled.</p>
        <p>Analytics stays off until you choose Allow analytics. Your choice is stored on this device; if storage is unavailable, it lasts for this visit. Declining later stops collection and clears Consumit&rsquo;s Google Analytics cookies on this host; it does not delete information already collected by Google. Blocking analytics does not affect browsing or playback. See <LegalLink href="https://policies.google.com/privacy">Google&rsquo;s Privacy Policy</LegalLink>.</p>
        <AnalyticsPreferences />
      </LegalSection>
    </LegalDocument>
  )
}
