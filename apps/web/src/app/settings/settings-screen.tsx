'use client'

import type { MemberProfile } from '@consumit/contracts'
import { Download, ExternalLink, LogOut, RefreshCw, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'

import {
  Avatar,
  Button,
  Input,
  Label,
  nativeLanguageName,
  PreferenceRow,
  PREFERRED_LANGUAGE_CODES,
  readStoredSubtitleLanguages,
  savePreferredSubtitleLanguages,
  SegmentedControl,
  ServiceMark,
  SettingsRail,
  SettingsSection,
  Toggle,
} from '@consumit/ui'

import { FilScreenShell } from '../shared'
import { useSession } from '../session/session'
import { changeMemberPassword, deleteMemberAccount, downloadMemberExport, IdentityApiError, logoutMember, updateMemberProfile } from '@/lib/identity-browser'
import { dicebearAvatarUrl, memberAvatarSrc, randomAvatarSeed } from '@/lib/avatar'

type ToggleKey = 'autoplay' | 'releases' | 'spoilers' | 'subtitles'

/** Preferred subtitle languages (max 3, priority order). Device-local like
 *  every player preference; the watch screen refetches live on change. */
function SubtitleLanguagePicker() {
  const [langs, setLangs] = useState<string[]>([])
  useEffect(() => { queueMicrotask(() => setLangs(readStoredSubtitleLanguages())) }, [])
  function toggle(code: string) {
    setLangs(savePreferredSubtitleLanguages(
      langs.includes(code) ? langs.filter((entry) => entry !== code) : [...langs, code].slice(0, 3),
    ))
  }
  return (
    <div>
      <div aria-label="Preferred subtitle languages" className="flex max-w-md flex-wrap gap-2" role="group">
        {PREFERRED_LANGUAGE_CODES.map((code) => {
          const order = langs.indexOf(code)
          const selected = order !== -1
          const capped = !selected && langs.length >= 3
          return (
            <button
              aria-pressed={selected}
              className={
                selected
                  ? 'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--fs-accent-soft)] px-3.5 text-sm font-bold text-[var(--fs-ink)] shadow-[inset_0_0_0_1px_var(--fs-accent)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                  : 'inline-flex min-h-10 items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3.5 text-sm font-bold text-[var(--fs-secondary)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-40'
              }
              disabled={capped}
              key={code}
              onClick={() => toggle(code)}
              title={selected ? `Preferred language ${order + 1}, remove` : capped ? 'Remove one first (3 max)' : 'Add as preferred language'}
              type="button"
            >
              {selected ? (
                <span aria-hidden="true" className="grid size-4 place-items-center rounded-full bg-[var(--fs-accent)] text-[10px] font-bold text-[var(--fs-on-accent)]">
                  {order + 1}
                </span>
              ) : null}
              {nativeLanguageName(code, code.toUpperCase())}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs tabular-nums text-[var(--fs-muted)]">{langs.length}/3 · subtitles are fetched in these languages first, in order.</p>
    </div>
  )
}

export function SettingsScreen({ initialProfile }: { initialProfile: MemberProfile }) {
  const router = useRouter()
  const session = useSession()
  const [values, setValues] = useState<Record<ToggleKey, boolean>>({
    autoplay: false,
    releases: true,
    spoilers: true,
    subtitles: true,
  })
  const [profile, setProfile] = useState(initialProfile)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatarUrl)
  const [profileSaved, setProfileSaved] = useState(false)
  const [accountAction, setAccountAction] = useState<'delete' | 'password' | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setAccountError(null)
    setProfileSaved(false)
    try {
      const updated = await updateMemberProfile({
        avatarUrl,
        bio: String(data.get('bio')).trim() || null,
        displayName: String(data.get('displayName')).trim() || null,
        location: String(data.get('location')).trim() || null,
        username: String(data.get('username')),
        visibility: 'private',
      })
      setProfile(updated)
      if (session.member) session.setMember({ ...session.member, avatarUrl: updated.avatarUrl, displayName: updated.displayName, username: updated.username })
      setProfileSaved(true)
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The profile could not be saved.')
    }
  }

  async function signOut() {
    setAccountError(null)
    try {
      await logoutMember()
      session.clearMember()
      router.push('/sign-in')
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'Sign out could not finish.')
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setAccountError(null)
    try {
      await changeMemberPassword({ currentPassword: String(data.get('currentPassword')), newPassword: String(data.get('newPassword')) })
      setAccountAction(null)
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The password could not be changed.')
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAccountError(null)
    try {
      await deleteMemberAccount(String(new FormData(event.currentTarget).get('password')))
      session.clearMember()
      router.push('/')
      router.refresh()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The account could not be deleted.')
    }
  }

  async function exportAccount() {
    setAccountError(null)
    try {
      await downloadMemberExport()
    } catch (error) {
      setAccountError(error instanceof IdentityApiError ? error.message : 'The export could not be prepared.')
    }
  }

  function toggle(key: ToggleKey) {
    setValues((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-settings-screen>
        <div className="px-1 sm:px-3 lg:px-4">
        <header className="border-b border-[var(--fs-line)] pb-10 sm:pb-12">
          <p className="text-xs font-bold tracking-[0.18em] text-[var(--fs-muted)] uppercase">Account</p>
          <h1 className="mt-2 font-display text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[0.95] font-normal tracking-[-0.025em] text-[var(--fs-ink)]">Settings.</h1>
          <p className="mt-4 max-w-[64ch] text-sm leading-7 text-[var(--fs-secondary)]">Shape your account, privacy, playback, and notifications without losing sight of what each choice changes.</p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-14">
          <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
            <SettingsRail
              activeHref="/settings"
              avatarSrc={session.member ? memberAvatarSrc(session.member.avatarUrl, session.member.id) : '/assets/hamza-avatar.svg'}
              avatarTreatment={session.member?.avatarStyle ?? profile.avatarStyle}
              className="min-w-0 max-w-full overflow-hidden [&_nav]:w-full [&_nav]:max-w-full [&_nav]:overflow-x-auto [&_ul]:flex [&_ul]:w-max [&_ul]:gap-2 [&_a]:whitespace-nowrap lg:[&_nav]:overflow-visible lg:[&_ul]:block lg:[&_ul]:w-auto lg:[&_ul]:space-y-1"
              username={`@${profile.username}`}
              items={[
                { href: '/settings', label: 'Account' },
                { href: '#privacy', label: 'Privacy & social' },
                { href: '#playback', label: 'Streaming & playback' },
                { href: '#language', label: 'Language & subtitles' },
                { href: '#notifications', label: 'Notifications' },
                { href: '#data', label: 'Data & security' },
              ]}
              memberName={profile.displayName ?? profile.username}
            />
            <aside className="hidden rounded-[16px] border border-[var(--fs-line)] bg-[var(--fs-field)] p-5 lg:block">
              <h2 className="text-sm font-bold text-[var(--fs-ink)]">Need a hand?</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">Playback and account support are kept separate from your social activity.</p>
              <Link className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[var(--fs-accent)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/help">Open help center <ExternalLink aria-hidden="true" className="size-4" /></Link>
            </aside>
          </div>

          <div className="space-y-12">
            <SettingsSection
              action={<Button form="profile-settings-form" type="submit" variant="accent"><Save aria-hidden="true" /> Save changes</Button>}
              description="The identity people see across your profile, reviews, and lists."
              title="Account"
            >
              <form className="grid gap-5 py-5 sm:grid-cols-2" id="profile-settings-form" onSubmit={saveProfile}>
                <div className="sm:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-copy" id="settings-avatar-label">Avatar portrait</span>
                  <div className="mt-3 flex flex-wrap items-center gap-5">
                    <Avatar imageAlt={`${profile.displayName ?? profile.username} portrait preview`} name={profile.displayName ?? profile.username} size="lg" src={memberAvatarSrc(avatarUrl, session.member?.id ?? profile.username)} treatment={profile.avatarStyle} />
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => setAvatarUrl(dicebearAvatarUrl(randomAvatarSeed()))} type="button" variant="secondary">
                        <RefreshCw aria-hidden="true" /> Randomize
                      </Button>
                      {avatarUrl ? (
                        <Button onClick={() => setAvatarUrl(null)} type="button" variant="ghost">Use generated tile</Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted">Portraits come from generated Notionists artwork. Randomize until one feels like you, then save.</p>
                </div>
                <div>
                  <Label htmlFor="settings-name">Display name</Label>
                  <Input className="mt-2 w-full" defaultValue={profile.displayName ?? ''} id="settings-name" maxLength={80} name="displayName" />
                </div>
                <div>
                  <Label htmlFor="settings-username">Username</Label>
                  <Input autoCapitalize="none" className="mt-2 w-full" defaultValue={profile.username} id="settings-username" maxLength={30} minLength={3} name="username" pattern="[a-z0-9_]{3,30}" required />
                  {profile.nextUsernameChangeAt ? <p className="mt-2 text-xs text-muted">Next username change: {new Date(profile.nextUsernameChangeAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p> : null}
                </div>
                <div><Label htmlFor="settings-location">Location</Label><Input className="mt-2 w-full" defaultValue={profile.location ?? ''} id="settings-location" maxLength={100} name="location" /></div>
                <p className="text-xs text-muted">Your profile and collections are private.</p>
                <div className="sm:col-span-2"><Label htmlFor="settings-bio">Bio</Label><textarea className="mt-2 min-h-28 w-full rounded-control border border-control-outline bg-field px-4 py-3 text-sm text-ink outline-none focus:border-orange focus:ring-2 focus:ring-orange" defaultValue={profile.bio ?? ''} id="settings-bio" maxLength={500} name="bio" /></div>
                <div className="sm:col-span-2">
                  <Label htmlFor="settings-email">Email</Label>
                  <Input className="mt-2 w-full" defaultValue={session.member?.email ?? ''} id="settings-email" readOnly type="email" />
                </div>
              </form>
              <PreferenceRow
                control={(
                  <Button
                    onClick={signOut}
                    variant="secondary"
                  >
                    <LogOut aria-hidden="true" /> Sign out
                  </Button>
                )}
                description="End the current server session on this browser."
                label="Session"
              />
            </SettingsSection>
            {accountError ? <p aria-live="assertive" className="-mt-9 text-xs text-coral">{accountError}</p> : null}
            <p aria-live="polite" className="-mt-9 text-xs text-lime">{profileSaved ? 'Profile saved.' : ''}</p>

            <SettingsSection
              className="scroll-mt-8"
              description="Your profile visibility is stored with your account. Social controls will appear only when the social system exists."
              id="privacy"
              title="Privacy & social"
            >
              <PreferenceRow
                control={<span className="rounded-control border border-control-outline px-4 py-2 text-sm font-bold capitalize text-ink">{profile.visibility}</span>}
                description="Change this saved value in the Account form above. Imported lists remain private until explicitly published."
                label="Profile visibility"
              />
              <PreferenceRow control={<span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Not available</span>} description="Follows and activity sharing are not implemented, so no activity is published. Consumit has no direct messaging." label="Social sharing" />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Your services guide availability. They are preferences, not linked billing accounts."
              id="playback"
              title="Streaming & playback"
            >
              <div className="py-5">
                <p className="text-sm font-bold text-ink">Availability preferences</p>
                <p className="mt-1 text-xs leading-5 text-muted">We use these choices to organize available sources. Consumit never manages or changes your subscriptions.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <ServiceMark description="Preferred for availability" name="Netflix" src="/assets/services/netflix.svg" />
                  <ServiceMark description="Preferred for availability" name="Shahid" src="/assets/services/shahid.svg" />
                </div>
                <Button className="mt-5" variant="secondary">Edit preferences</Button>
              </div>
              <PreferenceRow control={<Toggle checked={values.autoplay} label="Autoplay next episode" onCheckedChange={() => toggle('autoplay')} />} description="Start the next available episode after a short countdown." label="Autoplay next episode" />
              <PreferenceRow
                control={<SegmentedControl className="w-48" defaultValue="auto" legend="Playback quality" name="playback-quality" options={[{ label: 'Auto', value: 'auto' }, { label: 'Highest', value: 'highest' }]} />}
                description="The Consumit Player adapts quality while keeping the same first-party controls."
                label="Playback quality"
              />
              <PreferenceRow
                control={<SegmentedControl className="w-48" defaultValue="ask" legend="Unavailable source behavior" name="unavailable-behavior" options={[{ label: 'Ask me', value: 'ask' }, { label: 'Switch', value: 'switch' }]} />}
                description="Choose what happens if the current playback source becomes unavailable."
                label="Source changes"
              />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Keep dialogue readable without making subtitles feel detached from the film."
              id="language"
              title="Language & subtitles"
            >
              <PreferenceRow
                control={<SegmentedControl className="w-44" defaultValue="original" legend="Preferred audio" name="preferred-audio" options={[{ label: 'Original', value: 'original' }, { label: 'Dubbed', value: 'dubbed' }]} />}
                description="Prefer the original audio when the selected source includes it."
                label="Preferred audio"
              />
              <PreferenceRow control={<Toggle checked={values.subtitles} label="Enable subtitles by default" onCheckedChange={() => toggle('subtitles')} />} description="Start playback with English subtitles when available." label="Subtitles by default" />
              <PreferenceRow
                control={<SubtitleLanguagePicker />}
                description="Applies on this device to every movie, series, and anime. The first language also drives automatic track selection."
                label="Preferred subtitle languages"
              />
              <PreferenceRow control={<Toggle checked={values.spoilers} label="Hide spoilers" onCheckedChange={() => toggle('spoilers')} />} description="Keep spoiler-marked reviews and comments behind an explicit reveal." label="Hide spoilers" />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Only useful changes—never private chat or attention traps."
              id="notifications"
              title="Notifications"
            >
              <PreferenceRow control={<Toggle checked={values.releases} label="New episode notifications" onCheckedChange={() => toggle('releases')} />} description="Hear when a saved series has a new available episode." label="New episodes" />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Download your contribution or close the account with clear consequences."
              id="data"
              title="Data & security"
            >
              <PreferenceRow control={<Button onClick={exportAccount} variant="secondary"><Download aria-hidden="true" /> Request export</Button>} description="Download the member and profile data currently held for your account." label="Export your data" />
              <PreferenceRow control={<Link className="inline-flex min-h-11 items-center rounded-control border border-control-outline px-4 text-sm font-bold text-ink hover:bg-ink hover:text-canvas" href="/settings/imports/letterboxd">Import history</Link>} description="Bring diary history from Letterboxd without linking an account." label="Letterboxd import" />
              <PreferenceRow control={<Button onClick={() => setAccountAction(accountAction === 'password' ? null : 'password')} variant="secondary">Change password</Button>} description="You will be asked to confirm your current password first." label="Password" />
              {accountAction === 'password' ? (
                <form className="grid gap-4 border-t border-border py-5 sm:grid-cols-2" onSubmit={changePassword}>
                  <div><Label htmlFor="current-password">Current password</Label><Input autoComplete="current-password" className="mt-2 w-full" id="current-password" name="currentPassword" required type="password" /></div>
                  <div><Label htmlFor="new-password">New password</Label><Input autoComplete="new-password" className="mt-2 w-full" id="new-password" minLength={12} name="newPassword" required type="password" /></div>
                  <Button className="sm:col-span-2 sm:justify-self-start" type="submit">Update password</Button>
                </form>
              ) : null}
              <PreferenceRow control={<Button onClick={() => setAccountAction(accountAction === 'delete' ? null : 'delete')} variant="danger"><Trash2 aria-hidden="true" /> Delete account</Button>} description="Tombstone and anonymize the account after password confirmation." label="Delete account" />
              {accountAction === 'delete' ? (
                <form className="border-t border-border py-5" onSubmit={deleteAccount}>
                  <Label htmlFor="delete-password">Confirm your password</Label>
                  <Input autoComplete="current-password" className="mt-2 w-full max-w-md" id="delete-password" name="password" required type="password" />
                  <Button className="mt-4" type="submit" variant="danger"><Trash2 aria-hidden="true" /> Permanently delete account</Button>
                </form>
              ) : null}
            </SettingsSection>

            <section className="rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-5 sm:p-6" id="support">
              <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]">Something not behaving?</h2>
              <p className="mt-3 max-w-[62ch] text-sm leading-6 text-[var(--fs-muted)]">Report playback or account trouble without exposing passwords, payment details, or private browsing data.</p>
              <Link className="mt-6 inline-flex min-h-11 items-center rounded-control border border-control-outline px-4 text-sm font-bold text-ink outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-orange" href="/report-issue">Report an issue</Link>
            </section>
          </div>
        </div>
        </div>
      </main>
    </FilScreenShell>
  )
}
