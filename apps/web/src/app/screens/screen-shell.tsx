import type { ReactNode } from 'react'

import { Footer, GlobalNavigation } from '@consumit/ui'

export const artwork = {
  backdrop: '/assets/cinematic-backdrop.svg',
  northbound: '/assets/posters/northbound.svg',
  saltwater: '/assets/posters/saltwater.svg',
  thirdSun: '/assets/posters/third-sun.svg',
  violetHours: '/assets/posters/violet-hours.svg',
} as const

export const circle = [
  { name: 'Yasmine' },
  { name: 'Omar' },
  { name: 'Nadia' },
] as const

const navigationItems = [
  { href: '/', label: 'Home' },
  { href: '/movies', label: 'Movies' },
  { href: '/series', label: 'Series' },
  { href: '/friends', label: 'Friends' },
] as const

const footerLinks = [
  { href: '#about', label: 'About' },
  { href: '#help', label: 'Help' },
  { href: '#terms', label: 'Terms' },
  { href: '#privacy', label: 'Privacy' },
  { href: '/components', label: 'Components' },
] as const

type ScreenShellProps = {
  activeHref: string
  children: ReactNode
  searchDefaultValue?: string | undefined
  withFooter?: boolean | undefined
}

export function ScreenShell({
  activeHref,
  children,
  searchDefaultValue,
  withFooter = true,
}: ScreenShellProps) {
  return (
    <>
      <GlobalNavigation
        activeHref={activeHref}
        avatarSrc="/assets/hamza-avatar.svg"
        items={navigationItems}
        profileHref="/profile/hamza"
        profileName="Hamza"
        searchPlaceholder="Search titles, people, lists"
        sticky={false}
        {...(searchDefaultValue === undefined ? {} : { searchDefaultValue })}
      />
      {children}
      {withFooter ? (
        <Footer
          copyright="© 2026 Consumit"
          links={footerLinks}
        />
      ) : null}
    </>
  )
}
