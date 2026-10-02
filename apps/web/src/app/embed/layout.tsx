import { notFound } from 'next/navigation'

/** Public player embeds are deferred; keep their route tree unavailable. */
export default function EmbedLayout(): never {
  notFound()
}
