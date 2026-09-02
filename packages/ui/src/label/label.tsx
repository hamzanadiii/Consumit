import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

export type LabelProps = ComponentProps<'label'>

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        'block font-interface text-xs leading-5 font-bold tracking-[0.12em] text-copy uppercase',
        className,
      )}
      data-consumit-label
      {...props}
    />
  )
}
