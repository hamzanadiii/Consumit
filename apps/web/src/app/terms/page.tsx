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
      sections={[
        { id: 'terms-service', number: 1, title: 'The service' },
        { id: 'terms-account', number: 2, title: 'Your account' },
        { id: 'terms-use', number: 3, title: 'Acceptable use' },
        { id: 'terms-content', number: 4, title: 'Your content' },
        { id: 'terms-sources', number: 5, title: 'Third-party sources and availability' },
        { id: 'terms-ip', number: 6, title: 'Intellectual property' },
        { id: 'terms-changes', number: 7, title: 'Changes and termination' },
      ]}
      title="Terms of Service"
      lastUpdated="October 19, 2026"
    >
      <LegalSection id="terms-service" number={1} title="The service">
        <p>Consumit is a personal catalog, journal, and player. It organizes movie, series, and anime metadata from TMDB and AniList, keeps Watched records, Diary, History, playback progress, and account data, and plays titles through sources configured for this deployment. Profile identity and Favorites, Ratings, Reviews, Lists, Network, Likes, Tags, Watchlist, Watched, Diary, History, and Activity are visible by default and can be hidden separately. Active playback, resume progress, and account data remain private. Lists can be Public, Unlisted, or Private. Private lists are limited to the owner and invited editors; editors can change list content and order, while the owner controls visibility and deletion.</p>
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
        <p>The reviews, ratings, tags, lists, and other content you create stay yours. You grant Consumit a license to store them and show them inside the product: always to you, and to others when the relevant profile section and list are public. You can edit or delete your content at any time. Saved Lists are private bookmarks to the original public list; they follow its edits and become unavailable if the curator makes it private or deletes it. Anonymous bookmark totals may rank qualifying public lists in Home without showing bookmarker identities or counts. A separate, optional setting lets recent playback progress contribute anonymously to title-level trends. It does not show your identity, viewer counts, or live status.</p>
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
