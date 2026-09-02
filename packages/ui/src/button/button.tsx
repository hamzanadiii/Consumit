import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { LoaderCircle } from 'lucide-react'

import { cn } from '../lib/cn'

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2',
    'rounded-control font-interface font-medium tracking-[-0.01em]',
    'transition-[background-color,border-color,color,opacity] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:cursor-default disabled:opacity-45',
    'motion-reduce:transition-none',
    '[&_svg]:size-[1.125rem] [&_svg]:shrink-0 [&_svg]:stroke-[1.75]',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-ink text-canvas hover:bg-white active:bg-copy',
        accent:
          'bg-orange text-canvas hover:brightness-110 active:brightness-95',
        secondary:
          'border border-control-outline bg-transparent text-ink hover:bg-surface-raised active:bg-surface',
        ghost: 'bg-transparent text-copy hover:bg-surface hover:text-ink',
        danger:
          'bg-danger text-ink hover:brightness-110 active:brightness-95',
      },
      size: {
        sm: 'h-9 px-3 text-[0.8125rem]',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-5 text-[0.9375rem]',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'primary',
    },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
  }

export function Button({
  children,
  className,
  disabled,
  loading = false,
  size,
  type = 'button',
  variant,
  ...props
}: ButtonProps) {
  return (
    <button
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ size, variant }), className)}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? (
        <LoaderCircle
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
      ) : null}
      {children}
    </button>
  )
}
