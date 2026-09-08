import type { ReactNode } from 'react'
import Link from 'next/link'

import { Footer } from '@consumit/ui'

import { SessionNavigation } from '../session/session-navigation'

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
        searchPlaceholder="Search movies and series"
        sticky={false}
        {...(searchDefaultValue === undefined ? {} : { searchDefaultValue })}
      />
      {children}
      {withFooter ? (
        <Footer
          copyright="© 2026 Consumit"
          linkComponent={Link}
          links={footerLinks}
        />
      ) : null}
    </>
  )
}
