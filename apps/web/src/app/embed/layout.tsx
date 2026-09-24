import type { ReactNode } from 'react'

/** Public iframe shell: one dark Cinema After Midnight surface, no member chrome.
 *  Nested under the root layout — never render a second document. */
export default function EmbedLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className="min-h-dvh overflow-hidden bg-[#09090b] text-[#f4f0e8]"
      data-consumit-embed
    >
      {children}
    </div>
  )
}
