import { EmptyState } from '@consumit/ui'

import { ScreenShell } from '../screens/screen-shell'

export function FriendsScreen() {
  return (
    <ScreenShell activeHref="/friends">
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-friends-screen>
        <section className="border-b border-border px-5 py-16 sm:px-8 sm:py-20 lg:px-[62px] lg:py-24">
          <h1 className="text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5.25rem]">Friends</h1>
          <p className="mt-6 max-w-[62ch] text-sm leading-7 text-copy sm:text-base">A quiet place for activity from people you choose to follow.</p>
        </section>
        <section className="px-5 py-14 sm:px-8 sm:py-16 lg:px-[62px] lg:py-20">
          <EmptyState
            description="Following and activity are not available yet. Consumit will never invent members, follower counts, or watches to make this page look busy. Direct messages are not part of the product."
            title="Your social space is quiet"
          />
        </section>
      </main>
    </ScreenShell>
  )
}
