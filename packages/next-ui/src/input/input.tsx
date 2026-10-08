import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

export type InputProps = ComponentProps<'input'>

export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <input
      className={cn(
        'block h-[3.25rem] w-full min-w-0 rounded-control border border-control-outline bg-field px-4 font-interface text-sm text-ink outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out placeholder:text-muted hover:border-ink/60 focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange/30 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas read-only:bg-surface disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-muted disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:border-danger aria-[invalid=true]:focus-visible:ring-danger/40 motion-reduce:transition-none',
        className,
      )}
      data-consumit-input
      type={type}
      {...props}
    />
  )
}
