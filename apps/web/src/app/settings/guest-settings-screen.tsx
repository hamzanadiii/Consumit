'use client'

import Link from 'next/link'
import { SettingsSection, buttonVariants } from '@consumit/ui'
import { FilScreenShell } from '../shared'
import { AdStatus } from '../shared/ad-status'

export function GuestSettingsScreen() {
  return <FilScreenShell currentPathname="/settings">
    <main className="mx-auto w-full max-w-3xl py-5 sm:py-8">
      <h1 className="font-display text-4xl tracking-tight text-ink sm:text-5xl">Settings</h1>
      <p className="mt-4 max-w-prose text-sm leading-6 text-copy">Your browsing choices stay on this device. Sign in to sync them across devices and manage your account.</p>
      <div className="mt-9"><SettingsSection description="Choose whether Consumit can show sandboxed banner ads while you browse." id="advertising" title="Browsing & advertising"><AdStatus /></SettingsSection></div>
      <Link className={`${buttonVariants({ variant: 'secondary' })} mt-6`} href="/sign-in?next=%2Fsettings">Sign in for account settings</Link>
    </main>
  </FilScreenShell>
}
