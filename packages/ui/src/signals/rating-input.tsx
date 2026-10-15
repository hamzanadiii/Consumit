'use client'

import { useState, type ComponentProps } from 'react'

import { cn } from '../lib/cn'

export type RatingInputProps = Omit<ComponentProps<'div'>, 'children' | 'onChange'> & {
  disabled?: boolean | undefined
  label: string
  name: string
  onChange?: ((value: number | null) => void) | undefined
  value?: number | null | undefined
}

/**
 * Five-star member rating input with half-star steps covering the whole
 * 1-10 record scale. Each star is one glyph with a fractional orange
 * overlay; ten invisible half-width labels keep mouse, keyboard, touch,
 * and screen reader behavior exact. Hovering previews the hovered value
 * with a pop on the hovered star; clicking the set value again clears
 * the rating. The focus ring appears for keyboard focus only, never as a
 * stuck square after a pointer click (see styles.css).
 */
export function RatingInput({
  className,
  disabled = false,
  label,
  name,
  onChange,
  value = null,
  ...props
}: RatingInputProps) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value
  return (
    <div
      aria-label={label}
      className={cn('flex items-center gap-1', className)}
      data-consumit-rating-input
      onMouseLeave={() => setHover(null)}
      role="radiogroup"
      {...props}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = shown === null ? 0 : Math.min(Math.max((shown - (star - 1) * 2) / 2, 0), 1)
        const popped = hover !== null && Math.ceil(hover / 2) === star
        return (
          <span
            className={cn(
              'relative inline-flex rounded-micro outline-none transition-transform duration-150 motion-reduce:transition-none motion-reduce:transform-none',
              popped && 'scale-110',
            )}
            key={star}
            role="presentation"
          >
            <span aria-hidden="true" className="relative block text-[2rem] leading-none text-faint">
              {'\u2605'}
              <span aria-hidden="true" className="absolute inset-0 overflow-hidden text-orange" style={{ width: `${fill * 100}%` }}>
                {'\u2605'}
              </span>
            </span>
            {[0, 1].map((half) => {
              const step = star * 2 - 1 + half
              return (
                <label
                  className={cn('absolute inset-y-0 w-1/2 cursor-pointer', half === 0 ? 'left-0' : 'right-0')}
                  data-rating={step}
                  key={step}
                  onMouseEnter={() => {
                    if (!disabled) setHover(step)
                  }}
                >
                  <input
                    aria-label={`Rate ${step} out of 10`}
                    checked={value === step}
                    className="peer sr-only"
                    disabled={disabled}
                    name={name}
                    onChange={() => onChange?.(step)}
                    onClick={() => {
                      if (step === value) onChange?.(null)
                    }}
                    type="radio"
                    value={step}
                  />
                </label>
              )
            })}
          </span>
        )
      })}
    </div>
  )
}
