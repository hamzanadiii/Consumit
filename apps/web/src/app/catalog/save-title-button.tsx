'use client'

import { Bookmark } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@consumit/ui'

type SaveTitleButtonProps = {
  className?: string | undefined
  title: string
}

/**
 * Home-style save toggle shared by browse heroes and detail mastheads.
 * Self-contained client island: deterministic preview state only, so server
 * screens can render the same Watch + save pair without going client.
 */
export function SaveTitleButton({ className, title }: SaveTitleButtonProps) {
  const [saved, setSaved] = useState(false)
  return (
    <Button
      aria-label={saved ? `Remove ${title} from library` : `Save ${title} to library`}
      aria-pressed={saved}
      className={className}
      onClick={() => setSaved((value) => !value)}
      size="icon"
      type="button"
      variant="secondary"
    >
      <Bookmark aria-hidden="true" className={saved ? 'fill-current' : ''} />
    </Button>
  )
}
