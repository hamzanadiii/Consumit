'use client'

import { Button, PreferenceRow, Toggle } from '@consumit/ui'
import { useEffect, useRef, useState } from 'react'
import { readNotificationPreferences, setNotificationPreference } from '@/lib/releases-browser'
import { useReleaseResource } from '../notifications/use-release-resource'

export function NotificationPreference() {
  const { member, data, error, loading, refresh } = useReleaseResource(readNotificationPreferences)
  const [state, setState] = useState<{ owner: string; busy: boolean; error?: string; attempted?: boolean } | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [member?.id])
  const busy = state?.owner === member?.id && state?.busy, failure = state?.owner === member?.id ? state?.error : undefined
  async function change(enabled: boolean) {
    if (!member || busy) return
    const owner = member.id, next = new AbortController(); controller.current?.abort(); controller.current = next
    setState({ owner, busy: true })
    try {
      await setNotificationPreference(enabled, next.signal)
      if (!next.signal.aborted) { setState({ owner, busy: false }); refresh() }
    } catch { if (!next.signal.aborted) setState({ owner, busy: false, error: 'Your preference could not be saved. Try again.', attempted: enabled }) }
  }
  return <>
    <PreferenceRow label="New episodes from your Watchlist and Favorites" description="Optional in-app reminders after an exact episode passes a playback check. Your Home shelf works even with reminders off."
      control={<Toggle checked={data?.newEpisodes ?? false} disabled={!data || loading || Boolean(busy)} label="New episodes from your Watchlist and Favorites" onCheckedChange={enabled => void change(enabled)} />} />
    {loading ? <p className="py-2 text-xs text-muted" role="status">Reading notification preferences…</p> : null}
    {error || failure ? <div className="py-3 text-sm text-muted" role="alert"><p>{failure ?? error}</p><Button disabled={Boolean(busy)} onClick={() => { if (failure && state?.attempted !== undefined) void change(state.attempted); else refresh() }} size="sm" variant="secondary">Try again</Button></div> : null}
  </>
}
