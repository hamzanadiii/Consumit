import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

export type MissingArtworkProps = Omit<ComponentProps<'div'>, 'children'> & {
  label?: string | undefined
}

export function MissingArtwork({
  className,
  label = 'Artwork unavailable',
  ...props
}: MissingArtworkProps) {
  return (
    <div
      aria-label={label}
      className={cn(
        'relative size-full overflow-hidden bg-[linear-gradient(145deg,#263f45_0_38%,#2b2439_39%_68%,#141419_69%_100%)]',
        className,
      )}
      data-consumit-missing-artwork
      role="img"
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute top-[18%] left-[58%] size-[18%] rounded-full border border-ink/35"
      />
      <span
        aria-hidden="true"
        className="absolute right-[-8%] bottom-[-12%] size-[68%] rotate-12 bg-canvas/75 [clip-path:polygon(50%_0,100%_100%,0_100%)]"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}
