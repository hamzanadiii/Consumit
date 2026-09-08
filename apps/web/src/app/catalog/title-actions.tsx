'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'

import { buttonVariants } from '@consumit/ui'
import type { CatalogKind } from '@consumit/contracts'

import { SaveTitleButton } from './save-title-button'

type TitleActionsProps = {
  id: number
  kind: CatalogKind
  title: string
  titleHref: string
}

/**
 * The universal title action pair: watchlist toggle joined to the details
 * shortcut with no spacing between them. One component so every hero renders
 * the same pair.
 */
export function TitleActions({ id, kind, title, titleHref }: TitleActionsProps) {
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-control border border-control-outline">
      <SaveTitleButton className="rounded-none border-0 focus-visible:ring-inset" id={id} kind={kind} title={title} />
      <span aria-hidden="true" className="w-px self-stretch bg-control-outline" />
      <Link
        aria-label="Details"
        className={`${buttonVariants({ size: 'icon', variant: 'secondary' })} rounded-none border-0 focus-visible:ring-inset`}
        href={titleHref}
      >
        <Info aria-hidden="true" />
      </Link>
    </span>
  )
}
