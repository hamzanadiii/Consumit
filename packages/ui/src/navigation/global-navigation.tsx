'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Menu, Search, X } from 'lucide-react'
import { useId } from 'react'

import { Button } from '../button/button'
import { cn } from '../lib/cn'

export type NavigationItem = {
  href: string
  label: string
}

export type GlobalNavigationProps = {
  activeHref?: string
  avatarSrc?: string
  brandHref?: string
  brandMarkSrc?: string
  isProfileOnline?: boolean
  items?: readonly NavigationItem[]
  profileHref?: string
  profileName?: string
  searchAction?: string
  searchDefaultValue?: string
  searchPlaceholder?: string
  sticky?: boolean
}

export const defaultNavigationItems: readonly NavigationItem[] = [
  { href: '/', label: 'Home' },
  { href: '/movies', label: 'Movies' },
  { href: '/series', label: 'Series' },
  { href: '/friends', label: 'Friends' },
]

function Brand({ href, markSrc }: { href: string; markSrc: string }) {
  return (
    <a
      aria-label="Consumit home"
      className="group flex shrink-0 items-center gap-3 text-ink outline-none"
      href={href}
    >
      <img
        aria-hidden="true"
        className="size-8"
        src={markSrc}
      />
      <span className="text-[0.93rem] font-bold tracking-[0.2em] transition-colors group-hover:text-orange group-focus-visible:text-orange motion-reduce:transition-none">
        CONSUMIT
      </span>
    </a>
  )
}

function SearchForm({
  action,
  defaultValue,
  placeholder,
  variant,
}: {
  action: string
  defaultValue?: string | undefined
  placeholder: string
  variant: 'desktop' | 'mobile'
}) {
  const inputId = useId()

  return (
    <form action={action} className="relative" method="get" role="search">
      <label className="sr-only" htmlFor={inputId}>
        Search movies, series, and people
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 size-[1.125rem] -translate-y-1/2 text-muted"
        strokeWidth={2}
      />
      <input
        className={cn(
          'h-11 w-full rounded-control border border-control-outline bg-transparent pr-4 pl-11 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted hover:border-ink/60 focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange/35 motion-reduce:transition-none',
          variant === 'desktop' && 'w-56 xl:w-64',
        )}
        defaultValue={defaultValue}
        id={inputId}
        name="q"
        placeholder={placeholder}
        type="search"
      />
    </form>
  )
}

function ProfileAvatar({
  avatarSrc,
  isOnline,
  name,
}: {
  avatarSrc?: string | undefined
  isOnline: boolean
  name: string
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'C'

  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-visible rounded-full bg-surface-raised text-xs font-bold text-ink',
        avatarSrc ? 'border-0' : 'border border-ink/25',
        'size-11',
      )}
    >
      {avatarSrc ? (
        <img
          alt=""
          className="size-full rounded-full object-cover"
          src={avatarSrc}
        />
      ) : (
        initial
      )}
      {isOnline ? (
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-nav bg-lime"
          data-consumit-profile-presence
        />
      ) : null}
    </span>
  )
}

export function GlobalNavigation({
  activeHref = '/',
  avatarSrc,
  brandHref = '/',
  brandMarkSrc = '/assets/consumit-mark.svg',
  isProfileOnline = true,
  items = defaultNavigationItems,
  profileHref = '/profile',
  profileName = 'Profile',
  searchAction = '/search',
  searchDefaultValue,
  searchPlaceholder = 'Search anything',
  sticky = true,
}: GlobalNavigationProps) {
  const profileLabel = isProfileOnline
    ? `Open ${profileName} profile, online`
    : `Open ${profileName} profile`

  return (
    <header
      className={cn(
        'z-50 w-full border-b border-border bg-nav',
        sticky && 'sticky top-0',
      )}
    >
      <div className="mx-auto flex h-nav-mobile max-w-[90rem] items-center px-5 sm:px-8 lg:h-nav-desktop lg:px-[62px]">
        <Brand href={brandHref} markSrc={brandMarkSrc} />

        <nav
          aria-label="Primary navigation"
          className="ml-12 hidden h-full items-stretch lg:flex xl:ml-16"
        >
          {items.map((item) => {
            const isActive = item.href === activeHref

            return (
              <a
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center px-5 text-sm font-bold text-copy outline-none transition-colors hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange motion-reduce:transition-none xl:px-6',
                  isActive && 'text-ink',
                )}
                href={item.href}
                key={item.href}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-5 bottom-0 h-0.5 bg-orange transition-transform duration-200 motion-reduce:transition-none xl:inset-x-6',
                    isActive ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </a>
            )
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-5 lg:flex">
          <SearchForm
            action={searchAction}
            defaultValue={searchDefaultValue}
            placeholder={searchPlaceholder}
            variant="desktop"
          />
          <a
            aria-label={profileLabel}
            className="rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-4 focus-visible:ring-offset-nav motion-reduce:transform-none motion-reduce:transition-none"
            href={profileHref}
          >
            <ProfileAvatar
              avatarSrc={avatarSrc}
              isOnline={isProfileOnline}
              name={profileName}
            />
          </a>
        </div>

        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Button aria-label="Open navigation" size="icon" variant="ghost">
                <Menu aria-hidden="true" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay
                className="fixed inset-0 z-[60] bg-canvas/85"
                data-consumit-nav-overlay
              />
              <Dialog.Content
                className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-sm flex-col border-l border-border bg-nav px-6 py-5 text-ink outline-none sm:px-8"
                data-consumit-nav-panel
              >
                <Dialog.Title className="sr-only">
                  Primary navigation
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Browse Consumit and search the catalog.
                </Dialog.Description>

                <div className="flex items-center justify-between">
                  <Brand href={brandHref} markSrc={brandMarkSrc} />
                  <Dialog.Close asChild>
                    <Button
                      aria-label="Close navigation"
                      size="icon"
                      variant="ghost"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </Dialog.Close>
                </div>

                <div className="mt-10">
                  <SearchForm
                    action={searchAction}
                    defaultValue={searchDefaultValue}
                    placeholder={searchPlaceholder}
                    variant="mobile"
                  />
                </div>

                <nav
                  aria-label="Mobile primary navigation"
                  className="mt-8 flex flex-col border-t border-border"
                >
                  {items.map((item) => {
                    const isActive = item.href === activeHref

                    return (
                      <Dialog.Close asChild key={item.href}>
                        <a
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex min-h-16 items-center justify-between border-b border-border text-lg font-bold text-copy outline-none transition-colors hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange motion-reduce:transition-none',
                            isActive && 'text-ink',
                          )}
                          href={item.href}
                        >
                          {item.label}
                          <span
                            aria-hidden="true"
                            className={cn(
                              'h-0.5 w-8 bg-orange transition-transform motion-reduce:transition-none',
                              isActive ? 'scale-x-100' : 'scale-x-0',
                            )}
                          />
                        </a>
                      </Dialog.Close>
                    )
                  })}
                </nav>

                <a
                  aria-label={profileLabel}
                  className="mt-auto flex items-center gap-4 border-t border-border pt-5 text-sm font-bold text-ink outline-none focus-visible:text-orange"
                  href={profileHref}
                >
                  <ProfileAvatar
                    avatarSrc={avatarSrc}
                    isOnline={isProfileOnline}
                    name={profileName}
                  />
                  <span>
                    {profileName}
                    <span className="mt-1 block text-xs font-normal text-muted">
                      {isProfileOnline ? 'Online now' : 'View profile'}
                    </span>
                  </span>
                </a>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  )
}
