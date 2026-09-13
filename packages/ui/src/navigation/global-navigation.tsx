'use client'

import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bookmark, ChevronRight, CircleUserRound, LifeBuoy, LogOut, Menu, MessageSquareWarning, Search, Settings, X } from 'lucide-react'
import { useEffect, useId, useRef, type ElementType, type ReactNode } from 'react'

import { Button, buttonVariants } from '../button/button'
import { avatarTreatmentClasses, type AvatarTreatment } from '../identity/identity'
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
  helpHref?: string | undefined
  isProfileOnline?: boolean
  items?: readonly NavigationItem[]
  libraryHref?: string
  linkComponent?: ElementType | undefined
  memberHandle?: string | undefined
  onSignOut?: (() => void) | undefined
  profileHref?: string
  profileName?: string
  reportHref?: string | undefined
  searchAction?: string
  searchDefaultValue?: string
  searchPlaceholder?: string
  settingsHref?: string
  signedIn?: boolean
  signInHref?: string
  sticky?: boolean
  treatment?: AvatarTreatment | undefined
}

export const defaultNavigationItems: readonly NavigationItem[] = [
  { href: '/', label: 'Home' },
  { href: '/movies', label: 'Movies' },
  { href: '/series', label: 'Series' },
  { href: '/friends', label: 'Friends' },
]

function Brand({ href, linkComponent: LinkComponent, markSrc }: { href: string; linkComponent: ElementType; markSrc: string }) {
  return (
    <LinkComponent
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
    </LinkComponent>
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
  treatment = 'dusk',
}: {
  avatarSrc?: string | undefined
  isOnline: boolean
  name: string
  treatment?: AvatarTreatment | undefined
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'C'

  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-visible rounded-full border border-ink/25 text-xs font-bold',
        avatarSrc ? 'bg-surface-raised text-ink' : (avatarTreatmentClasses[treatment] ?? avatarTreatmentClasses.dusk),
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

const menuRowClasses = 'flex min-h-12 cursor-pointer items-center gap-3 rounded-micro px-3 text-sm font-bold text-ink outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange data-[highlighted]:bg-surface-raised motion-reduce:transition-none'

function MenuLinkRow({ active, href, icon, label, linkComponent: LinkComponent }: { active?: boolean | undefined; href: string; icon: ReactNode; label: string; linkComponent: ElementType }) {
  return (
    <DropdownMenu.Item asChild>
      <LinkComponent
        aria-current={active ? 'page' : undefined}
        className={cn(menuRowClasses, active && 'bg-surface-raised')}
        href={href}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
      </LinkComponent>
    </DropdownMenu.Item>
  )
}

export type ProfileMenuProps = {
  activeHref?: string | undefined
  avatarSrc?: string | undefined
  helpHref?: string | undefined
  isProfileOnline?: boolean | undefined
  libraryHref?: string | undefined
  linkComponent?: ElementType | undefined
  memberHandle?: string | undefined
  onSignOut?: (() => void) | undefined
  profileHref?: string | undefined
  profileName?: string | undefined
  reportHref?: string | undefined
  settingsHref?: string | undefined
  treatment?: AvatarTreatment | undefined
}

export function ProfileMenu({
  activeHref,
  avatarSrc,
  helpHref,
  isProfileOnline = true,
  libraryHref = '/library',
  linkComponent: LinkComponent = 'a',
  memberHandle,
  onSignOut,
  profileHref = '/profile',
  profileName = 'Profile',
  reportHref,
  settingsHref = '/settings',
  treatment = 'dusk',
}: ProfileMenuProps) {
  const triggerLabel = isProfileOnline ? `${profileName} menu, online` : `${profileName} menu`
  const isProfileActive = activeHref === profileHref
  // Radix returns focus to the trigger on close. That is correct after
  // keyboard use, but it leaves a stuck-looking ring after pointer
  // dismissal, so focus is only restored for keyboard interaction.
  const lastInteractionWasPointer = useRef(false)

  useEffect(() => {
    const markPointer = () => {
      lastInteractionWasPointer.current = true
    }
    const markKeyboard = (event: KeyboardEvent) => {
      // Escape dismisses with the opening modality, so it must not flip it.
      if (event.key === 'Escape') return
      lastInteractionWasPointer.current = false
    }
    window.addEventListener('pointerdown', markPointer, true)
    window.addEventListener('keydown', markKeyboard, true)
    return () => {
      window.removeEventListener('pointerdown', markPointer, true)
      window.removeEventListener('keydown', markKeyboard, true)
    }
  }, [])

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={triggerLabel}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none transition-[transform,box-shadow] hover:scale-105 hover:ring-2 hover:ring-orange/60 hover:ring-offset-4 hover:ring-offset-nav focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-4 focus-visible:ring-offset-nav data-[state=open]:ring-2 data-[state=open]:ring-orange data-[state=open]:ring-offset-4 data-[state=open]:ring-offset-nav motion-reduce:transform-none motion-reduce:transition-none"
          type="button"
        >
          <ProfileAvatar
            avatarSrc={avatarSrc}
            isOnline={isProfileOnline}
            name={profileName}
            treatment={treatment}
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          aria-label={`${profileName} menu`}
          className="z-[80] w-[19rem] rounded-card border border-border bg-nav p-3 shadow-xl shadow-black/50 outline-none"
          onCloseAutoFocus={(event) => {
            if (lastInteractionWasPointer.current) event.preventDefault()
          }}
          sideOffset={8}
        >
          <div className="flex items-start gap-3 px-3 pt-2 pb-3">
            <ProfileAvatar
              avatarSrc={avatarSrc}
              isOnline={isProfileOnline}
              name={profileName}
              treatment={treatment}
            />
            <span className="min-w-0 flex-1 pt-1">
              <span className="block truncate text-sm font-bold text-ink">{profileName}</span>
              {memberHandle ? <span className="mt-0.5 block truncate text-xs text-muted">@{memberHandle}</span> : null}
            </span>
          </div>
          <DropdownMenu.Separator className="mx-3 h-px bg-border" />
          <div className="py-2" role="presentation">
            <MenuLinkRow
              active={isProfileActive}
              href={profileHref}
              icon={<CircleUserRound aria-hidden="true" className="size-5 shrink-0 text-orange" />}
              label="My profile"
              linkComponent={LinkComponent}
            />
            <MenuLinkRow
              active={activeHref === libraryHref}
              href={libraryHref}
              icon={<Bookmark aria-hidden="true" className="size-5 shrink-0 text-orange" />}
              label="My Library"
              linkComponent={LinkComponent}
            />
            <MenuLinkRow
              active={activeHref === settingsHref}
              href={settingsHref}
              icon={<Settings aria-hidden="true" className="size-5 shrink-0 text-muted" />}
              label="Settings"
              linkComponent={LinkComponent}
            />
          </div>
          {helpHref || reportHref ? (
            <>
              <DropdownMenu.Separator className="mx-3 h-px bg-border" />
              <div className="py-2" role="presentation">
                {helpHref ? (
                  <MenuLinkRow
                    active={activeHref === helpHref}
                    href={helpHref}
                    icon={<LifeBuoy aria-hidden="true" className="size-5 shrink-0 text-muted" />}
                    label="Help Center"
                    linkComponent={LinkComponent}
                  />
                ) : null}
                {reportHref ? (
                  <MenuLinkRow
                    active={activeHref === reportHref}
                    href={reportHref}
                    icon={<MessageSquareWarning aria-hidden="true" className="size-5 shrink-0 text-orange" />}
                    label="Report an issue"
                    linkComponent={LinkComponent}
                  />
                ) : null}
              </div>
            </>
          ) : null}
          <DropdownMenu.Separator className="mx-3 h-px bg-border" />
          <div className="py-2" role="presentation">
            {onSignOut ? (
              <DropdownMenu.Item
                className={cn(menuRowClasses, 'text-orange')}
                onSelect={() => onSignOut()}
              >
                <LogOut aria-hidden="true" className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Sign out</span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
              </DropdownMenu.Item>
            ) : null}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function GlobalNavigation({
  activeHref = '/',
  avatarSrc,
  brandHref = '/',
  brandMarkSrc = '/assets/consumit-mark.svg',
  helpHref,
  isProfileOnline = true,
  items = defaultNavigationItems,
  libraryHref = '/library',
  linkComponent: LinkComponent = 'a',
  memberHandle,
  onSignOut,
  profileHref = '/profile',
  profileName = 'Profile',
  reportHref,
  searchAction = '/search',
  searchDefaultValue,
  searchPlaceholder = 'Search anything',
  settingsHref = '/settings',
  signedIn = true,
  signInHref = '/sign-in',
  sticky = true,
  treatment = 'dusk',
}: GlobalNavigationProps) {
  const profileLabel = isProfileOnline
    ? `Open ${profileName} profile, online`
    : `Open ${profileName} profile`
  const isProfileActive = activeHref === profileHref

  return (
    <header
      className={cn(
        'consumit-global-navigation z-50 w-full border-b border-border bg-nav',
        sticky && 'sticky top-0',
      )}
    >
      <div
        className="mx-auto flex h-nav-mobile max-w-[90rem] items-center px-5 sm:px-8 lg:h-nav-desktop lg:px-[50px]"
        data-session-state={signedIn ? 'signed-in' : 'signed-out'}
      >
        <Brand href={brandHref} linkComponent={LinkComponent} markSrc={brandMarkSrc} />

        <nav
          aria-label="Primary navigation"
          className="ml-12 hidden h-full items-stretch lg:flex xl:ml-16"
        >
          {items.map((item) => {
            const isActive = item.href === activeHref

            return (
              <LinkComponent
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
              </LinkComponent>
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
          {signedIn ? (
            <ProfileMenu
              activeHref={activeHref}
              avatarSrc={avatarSrc}
              helpHref={helpHref}
              isProfileOnline={isProfileOnline}
              libraryHref={libraryHref}
              linkComponent={LinkComponent}
              memberHandle={memberHandle}
              onSignOut={onSignOut}
              profileHref={profileHref}
              profileName={profileName}
              reportHref={reportHref}
              settingsHref={settingsHref}
              treatment={treatment}
            />
          ) : (
            <LinkComponent className={buttonVariants({ size: 'md' })} href={signInHref}>
              Sign in
            </LinkComponent>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          {!signedIn ? (
            <LinkComponent className={buttonVariants({ size: 'md' })} href={signInHref}>
              Sign in
            </LinkComponent>
          ) : null}
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
                  <Brand href={brandHref} linkComponent={LinkComponent} markSrc={brandMarkSrc} />
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
                        <LinkComponent
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
                        </LinkComponent>
                      </Dialog.Close>
                    )
                  })}
                </nav>

                {signedIn ? (
                  <LinkComponent
                    aria-label={profileLabel}
                    aria-current={isProfileActive ? 'page' : undefined}
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
                  </LinkComponent>
                ) : (
                  <Dialog.Close asChild>
                    <LinkComponent className={cn(buttonVariants(), 'mt-auto w-full')} href={signInHref}>
                      Sign in
                    </LinkComponent>
                  </Dialog.Close>
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  )
}
