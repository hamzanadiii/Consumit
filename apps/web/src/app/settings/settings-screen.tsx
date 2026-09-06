'use client'

import { Download, ExternalLink, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  Button,
  Input,
  Label,
  PreferenceRow,
  SegmentedControl,
  ServiceMark,
  SettingsRail,
  SettingsSection,
  Toggle,
} from '@consumit/ui'

import { ScreenShell } from '../screens/screen-shell'

type ToggleKey = 'activity' | 'autoplay' | 'history' | 'ratings' | 'releases' | 'spoilers' | 'subtitles'

export function SettingsScreen() {
  const [values, setValues] = useState<Record<ToggleKey, boolean>>({
    activity: true,
    autoplay: false,
    history: true,
    ratings: true,
    releases: true,
    spoilers: true,
    subtitles: true,
  })
  const [saved, setSaved] = useState(false)

  function toggle(key: ToggleKey) {
    setValues((current) => ({ ...current, [key]: !current[key] }))
    setSaved(false)
  }

  return (
    <ScreenShell activeHref="/settings">
      <main className="mx-auto w-full max-w-[90rem] px-5 py-14 sm:px-8 sm:py-16 lg:px-[62px] lg:py-20" data-consumit-settings-screen>
        <header className="border-b border-border pb-10 sm:pb-12">
          <h1 className="font-display text-5xl leading-none tracking-[-0.03em] text-ink sm:text-6xl">Settings</h1>
          <p className="mt-5 max-w-[64ch] text-sm leading-7 text-copy">Shape your account, privacy, playback, and notifications without losing sight of what each choice changes.</p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-14">
          <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
            <SettingsRail
              activeHref="/settings"
              avatarSrc="/assets/hamza-avatar.svg"
              className="min-w-0 max-w-full overflow-hidden [&_nav]:w-full [&_nav]:max-w-full [&_nav]:overflow-x-auto [&_ul]:flex [&_ul]:w-max [&_ul]:gap-2 [&_a]:whitespace-nowrap lg:[&_nav]:overflow-visible lg:[&_ul]:block lg:[&_ul]:w-auto lg:[&_ul]:space-y-1"
              handle="@hamza"
              items={[
                { href: '/settings', label: 'Account' },
                { href: '#privacy', label: 'Privacy & social' },
                { href: '#playback', label: 'Streaming & playback' },
                { href: '#language', label: 'Language & subtitles' },
                { href: '#notifications', label: 'Notifications' },
                { href: '#data', label: 'Data & security' },
              ]}
              memberName="Hamza"
            />
            <aside className="hidden rounded-card border border-border bg-surface p-5 lg:block">
              <h2 className="text-sm font-bold text-ink">Need a hand?</h2>
              <p className="mt-2 text-xs leading-5 text-muted">Playback and account support are kept separate from your social activity.</p>
              <a className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-orange outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="#support">Open help center <ExternalLink aria-hidden="true" className="size-4" /></a>
            </aside>
          </div>

          <div className="space-y-12">
            <SettingsSection
              action={<Button onClick={() => setSaved(true)} variant="accent"><Save aria-hidden="true" /> Save changes</Button>}
              description="The identity people see across your profile, reviews, and lists."
              title="Account"
            >
              <div className="grid gap-5 py-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="settings-name">Display name</Label>
                  <Input className="mt-2 w-full" defaultValue="Hamza" id="settings-name" />
                </div>
                <div>
                  <Label htmlFor="settings-handle">Username</Label>
                  <Input className="mt-2 w-full" defaultValue="hamza" id="settings-handle" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="settings-email">Email</Label>
                  <Input className="mt-2 w-full" defaultValue="hamza@example.com" id="settings-email" type="email" />
                </div>
              </div>
            </SettingsSection>
            <p aria-live="polite" className="-mt-9 text-xs text-lime">{saved ? 'Account preferences saved for this preview.' : ''}</p>

            <SettingsSection
              className="scroll-mt-8"
              description="Choose what others can learn from your taste and watch history."
              id="privacy"
              title="Privacy & social"
            >
              <PreferenceRow
                control={<SegmentedControl className="w-44" defaultValue="public" legend="Profile visibility" name="profile-visibility" options={[{ label: 'Public', value: 'public' }, { label: 'Private', value: 'private' }]} />}
                description="A public profile lets other members discover your reviews and lists."
                label="Profile visibility"
              />
              <PreferenceRow control={<Toggle checked={values.history} label="Show watch history" onCheckedChange={() => toggle('history')} />} description="Include recent watches and diary entries on your profile." label="Show watch history" />
              <PreferenceRow control={<Toggle checked={values.ratings} label="Show ratings and reviews" onCheckedChange={() => toggle('ratings')} />} description="Let your circle use your ratings as discovery context." label="Show ratings and reviews" />
              <PreferenceRow control={<Toggle checked={values.activity} label="Share activity with your circle" onCheckedChange={() => toggle('activity')} />} description="Your follows can see asynchronous saves, ratings, and list updates. Consumit has no direct messaging." label="Share activity with your circle" />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Your services guide availability. They are preferences, not linked billing accounts."
              id="playback"
              title="Streaming & playback"
            >
              <div className="py-5">
                <p className="text-sm font-bold text-ink">Availability preferences</p>
                <p className="mt-1 text-xs leading-5 text-muted">We use these choices to organize authorized sources. Consumit never manages or changes your subscriptions.</p>
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
                description="Choose what happens if the current authorized source becomes unavailable."
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
              <PreferenceRow control={<Toggle checked={values.spoilers} label="Hide spoilers" onCheckedChange={() => toggle('spoilers')} />} description="Keep spoiler-marked reviews and comments behind an explicit reveal." label="Hide spoilers" />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Only useful changes—never private chat or attention traps."
              id="notifications"
              title="Notifications"
            >
              <PreferenceRow control={<Toggle checked={values.releases} label="New episode notifications" onCheckedChange={() => toggle('releases')} />} description="Hear when a saved series has a new available episode." label="New episodes" />
              <PreferenceRow
                control={<SegmentedControl className="w-48" defaultValue="daily" legend="Circle activity summary" name="circle-digest" options={[{ label: 'Daily', value: 'daily' }, { label: 'Off', value: 'off' }]} />}
                description="A quiet summary of ratings, reviews, and list updates from people you follow."
                label="Circle digest"
              />
            </SettingsSection>

            <SettingsSection
              className="scroll-mt-8"
              description="Download your contribution or close the account with clear consequences."
              id="data"
              title="Data & security"
            >
              <PreferenceRow control={<Button variant="secondary"><Download aria-hidden="true" /> Request export</Button>} description="Prepare your ratings, reviews, lists, and watch history as a downloadable archive." label="Export your data" />
              <PreferenceRow control={<Button variant="secondary">Import history</Button>} description="Bring ratings and diary history from Letterboxd without linking a billing account." label="Letterboxd import" />
              <PreferenceRow control={<Button variant="secondary">Change password</Button>} description="You’ll be asked to confirm your current password first." label="Password" />
              <PreferenceRow control={<Button variant="danger"><Trash2 aria-hidden="true" /> Delete account</Button>} description="Permanently remove your profile and contributions after a confirmation period." label="Delete account" />
            </SettingsSection>

            <section className="rounded-card border border-border bg-surface p-6" id="support">
              <h2 className="font-display text-3xl text-ink">Something not behaving?</h2>
              <p className="mt-3 max-w-[62ch] text-sm leading-6 text-muted">Report playback or account trouble without exposing passwords, payment details, or private browsing data.</p>
              <Button className="mt-6" variant="secondary">Report an issue</Button>
            </section>
          </div>
        </div>
      </main>
    </ScreenShell>
  )
}
