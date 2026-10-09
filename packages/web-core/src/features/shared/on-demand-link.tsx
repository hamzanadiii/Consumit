import Link from 'next/link'
import type { ComponentProps } from 'react'

/** Avoid fetching destination pages for large navigation and poster collections. */
export function OnDemandLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} />
}
