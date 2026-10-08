import type { Metadata } from 'next'

import { LegalDocument, LegalLink, LegalNotice, LegalSection } from '../legal/legal-document'

export const metadata: Metadata = {
  title: 'DMCA Notice · Consumit',
  description: 'How to request removal of material that infringes your copyright on Consumit.',
  robots: { follow: true, index: true },
}

export default function DmcaPage() {
  return (
    <LegalDocument
      intro={<>Consumit respects intellectual property rights. This page explains how to ask us to remove material that infringes your copyright, and what we can and cannot remove.</>}
      title="DMCA Notice"
    >
      <LegalSection id="dmca-hosting" number={1} title="What Consumit hosts">
        <LegalNotice>Consumit does not host, upload, store, or stream video files. It provides catalog metadata, your own writing, and playback connections to third-party sources.</LegalNotice>
        <p>Media files live on servers operated by third parties. Removing a title or a source from Consumit changes Consumit only; it does not remove the file from the internet.</p>
      </LegalSection>
      <LegalSection id="dmca-action" number={2} title="What we can act on">
        <p>For a valid notice, we can:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>remove or restrict member content that infringes your copyright, such as a review or list;</li>
          <li>stop Consumit from indexing or linking to a specific title or URL; and</li>
          <li>disable a configured playback source for the material you identify.</li>
        </ul>
      </LegalSection>
      <LegalSection id="dmca-submit" number={3} title="Submitting a notice">
        <p><LegalLink href="/report-issue">Send your notice through the report form</LegalLink> (choose <em>Something else</em> and start the subject with &ldquo;DMCA&rdquo;). To let us act quickly, include:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>identification of the copyrighted work you claim has been infringed;</li>
          <li>the exact Consumit URL where the material appears;</li>
          <li>your name, email address, and postal address;</li>
          <li>a statement of good faith, and a statement under penalty of perjury that the information is accurate and you are authorized to act; and</li>
          <li>your physical or electronic signature.</li>
        </ul>
      </LegalSection>
      <LegalSection id="dmca-misuse" number={4} title="Before you send">
        <p><em><strong className="text-ink not-italic">Important:</strong> knowingly and materially misrepresenting that material is infringing may expose you to liability for damages, including costs and legal fees.</em></p>
        <p>If the file itself is your concern, contact the server that hosts it: only that host can remove the file permanently.</p>
      </LegalSection>
    </LegalDocument>
  )
}
