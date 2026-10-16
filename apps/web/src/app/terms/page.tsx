import type { Metadata } from 'next'

import { LegalDocument, LegalSection } from '../legal/legal-document'

export const metadata: Metadata = {
  title: 'Terms of Service · Consumit',
  description: 'The terms that govern your use of Consumit, its catalog, library, and player.',
  robots: { follow: true, index: true },
}

export default function TermsPage() {
  return (
    <LegalDocument
      intro={<>Welcome to Consumit. These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Consumit: its catalog, your personal library, and the Consumit Player. By creating an account or using the product, you agree to these Terms.</>}
      title="Terms of Service"
    >
      <LegalSection id="terms-service" number={1} title="The service">
        <p>Consumit is a personal catalog, journal, and player. It organizes movie, series, and anime metadata from TMDB and AniList, keeps your private watch progress, diary, ratings, reviews, and lists, and plays titles through sources configured for this deployment.</p>
        <p>Consumit does not host, upload, or store video files. Media is delivered by third-party sources described in Section 5.</p>
      </LegalSection>
      <LegalSection id="terms-account" number={2} title="Your account">
        <p>An account needs an available username, a verified email address, and a password. You are responsible for keeping your credentials confidential and for the activity that happens under your account. Report suspected unauthorized use through the Help Center and we will help you secure it.</p>
      </LegalSection>
      <LegalSection id="terms-use" number={3} title="Acceptable use">
        <p>You may use Consumit for personal, non-commercial viewing. You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>scrape, overload, or probe the product, its API, or its configured sources beyond normal personal use;</li>
          <li>attempt unauthorized access to accounts, sessions, or infrastructure;</li>
          <li>resell, redistribute, or automate access to the product;</li>
          <li>post content that infringes rights, harasses others, or is unlawful in your jurisdiction; or</li>
          <li>interfere with the player, relay, or provider configuration.</li>
        </ul>
      </LegalSection>
      <LegalSection id="terms-content" number={4} title="Your content">
        <p>The reviews, ratings, tags, and lists you create stay yours. You grant Consumit a license to store them and show them inside the product: always to you, and to others only where your visibility settings allow. You can edit or delete your content at any time, and closing your account removes it.</p>
      </LegalSection>
      <LegalSection id="terms-sources" number={5} title="Third-party sources and availability">
        <p>Titles play through third-party sources that Consumit does not operate. Availability, quality, and the legality of a source are that source&rsquo;s responsibility. Consumit validates and selects configured sources, but it cannot promise that a title will always play.</p>
        <p>When a source stops working, the player says so and offers recovery paths instead of silently substituting a different title or site.</p>
      </LegalSection>
      <LegalSection id="terms-ip" number={6} title="Intellectual property">
        <p>The Consumit interface, brand, and code are the property of Consumit. Posters, backdrops, logos, and title metadata belong to their respective rights holders and are used under the TMDB and AniList API terms.</p>
      </LegalSection>
      <LegalSection id="terms-changes" number={7} title="Changes and termination">
        <p>We may suspend or close accounts that violate these Terms, and we may modify or discontinue parts of the product. If we revise these Terms, the Last updated date changes; continuing to use Consumit after a change means you accept the revised Terms.</p>
      </LegalSection>
    </LegalDocument>
  )
}
