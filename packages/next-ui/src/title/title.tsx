import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'
import { Select } from '../selection/selection'

export type CastCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  character?: string | undefined
  href?: string | undefined
  imageSrc?: string | undefined
  name: string
  role?: string | undefined
}

export function CastCard({
  character,
  className,
  href,
  imageSrc,
  name,
  role,
  ...props
}: CastCardProps) {
  return (
    <article className={cn('group min-w-0', className)} data-consumit-cast-card {...props}>
      <div className="grid aspect-[4/5] place-items-center overflow-hidden rounded-card border border-border bg-surface">
        {imageSrc ? (
          <img alt={`${name} portrait`} className="size-full object-cover" loading="lazy" src={imageSrc} />
        ) : (
          <div aria-hidden="true" className="relative size-full overflow-hidden">
            <span className="absolute top-[13%] left-1/2 size-[42%] -translate-x-1/2 rounded-full bg-[linear-gradient(135deg,#e29a72_0_48%,#382c43_49%_100%)]" />
            <span className="absolute inset-x-[20%] bottom-0 h-[45%] rounded-t-full bg-surface-raised" />
          </div>
        )}
      </div>
      {href ? (
        <a className="mt-3 block truncate text-sm font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas" href={href}>
          {name}
        </a>
      ) : (
        <h3 className="mt-3 truncate text-sm font-bold text-ink">{name}</h3>
      )}
      {character || role ? <p className="mt-1 truncate text-xs text-muted">{character ?? role}</p> : null}
    </article>
  )
}

export type SeasonOption = {
  label: string
  value: string
}

export type SeasonSelectorProps = {
  className?: string | undefined
  disabled?: boolean | undefined
  id?: string | undefined
  label?: string | undefined
  name?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  options: readonly SeasonOption[]
  value?: string | undefined
}

export function SeasonSelector({
  className,
  disabled,
  id,
  label = 'Season',
  name,
  onValueChange,
  options,
  value,
}: SeasonSelectorProps) {
  return (
    <Select
      className={className}
      data-consumit-season-selector
      disabled={disabled}
      id={id}
      label={label}
      name={name}
      onValueChange={onValueChange}
      options={options}
      value={value}
    />
  )
}
