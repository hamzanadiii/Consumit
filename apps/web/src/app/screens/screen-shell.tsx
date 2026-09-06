import type { ReactNode } from 'react'

import { Footer } from '@consumit/ui'

import { CatalogPreviewNotice } from '../catalog/catalog-attribution'
import { SessionNavigation } from '../session/session-navigation'

export const circle = [
  { name: 'Yasmine' },
  { name: 'Omar' },
  { name: 'Nadia' },
] as const

const footerLinks = [
  { href: '/about', label: 'About' },
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
      <SessionNavigation
        activeHref={activeHref}
        avatarSrc="/assets/hamza-avatar.svg"
        profileHref="/profile/hamza"
        profileName="Hamza"
        searchPlaceholder="Search titles, people, lists"
        sticky={false}
        {...(searchDefaultValue === undefined ? {} : { searchDefaultValue })}
      />
      <CatalogPreviewNotice />
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
