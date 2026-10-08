import type { Metadata } from 'next'

import { LegalDocument, LegalLink, LegalNotice, LegalSection } from '../legal/legal-document'

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
    >
      <LegalSection id="privacy-collect" number={1} title="Information we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-ink">Account data:</strong> your email address, username, and password, stored only as a secure hash.</li>
          <li><strong className="text-ink">Profile:</strong> display name, bio, avatar, banner, and your visibility preference.</li>
          <li><strong className="text-ink">Viewing data:</strong> watch progress, diary entries, ratings, reviews, lists, watchlist, and favorites. This stays private to your account.</li>
          <li><strong className="text-ink">Technical data:</strong> session state, security-relevant request details such as IP address and origin, and aggregated performance measurements (web vitals). There are no advertising identifiers.</li>
        </ul>
      </LegalSection>
      <LegalSection id="privacy-use" number={2} title="How we use it">
        <p>We use this information to authenticate you, keep your sessions secure, remember where you stopped watching, render your library and archives, diagnose playback failures, and understand aggregate performance. We do not use your viewing data to build advertising profiles. Display advertising is served by our advertising partner Adsterra, which may use its own cookies as described in section 5.</p>
      </LegalSection>
      <LegalSection id="privacy-playback" number={3} title="Playback and third-party sources">
        <LegalNotice>Consumit does not host any media. When you press Watch, your browser requests the video from a configured third-party source, sometimes through Consumit&rsquo;s relay.</LegalNotice>
        <p>Because your browser connects to those servers directly, <strong className="text-ink">the source sees your IP address</strong> and is governed by its own privacy policy, which we do not control. If you want to keep your address away from third-party hosts, use a reputable VPN.</p>
      </LegalSection>
      <LegalSection id="privacy-sharing" number={4} title="Sharing and security">
        <p>We never sell, rent, or trade your personal information. Data is shared only with the infrastructure that runs Consumit (hosting, database, cache, and email delivery), with catalog APIs that receive ordinary metadata requests, or when a lawful request requires it.</p>
        <p>Passwords are hashed with Argon2id, sessions use opaque tokens, and mutations require a verified origin. No method of transmission over the internet is 100% secure.</p>
      </LegalSection>
      <LegalSection id="privacy-storage" number={5} title="Local storage and cookies">
        <p>Consumit uses a session cookie to keep you signed in and local storage for device preferences such as theme. Display advertising from our partner Adsterra loads third-party scripts that may set their own cookies to serve and measure ads. Those cookies are governed by Adsterra&rsquo;s privacy policy, not this one. Blocking third-party scripts or cookies hides the ad slots without breaking the rest of the site.</p>
      </LegalSection>
      <LegalSection id="privacy-choices" number={6} title="Your choices">
        <p>From Settings you can export the data held for your account, change your password, adjust profile visibility, or close your account and delete its records. For any other data question, <LegalLink href="/report-issue">contact us through the report form</LegalLink> or start with the <LegalLink href="/help">Help Center</LegalLink>.</p>
      </LegalSection>
    </LegalDocument>
  )
}
