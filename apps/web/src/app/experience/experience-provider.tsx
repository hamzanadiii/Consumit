'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { defaultExperiencePreferences, experiencePreferencesSchema, hasPlaybackPreferences, type ExperiencePatch, type ExperiencePreferences } from '@consumit/contracts'
import { experienceRequest } from '@/lib/experience-browser'
import { applyPlayerDefaults, readExperience, storeExperience, readPendingExperience, storePendingExperience, experienceStorageKey } from '@/lib/experience-storage'

type State = { owner: string | null; preferences: ExperiencePreferences; ready: boolean; saved: boolean; error: string | null }
type Context = State & { patch: (patch: ExperiencePatch) => Promise<void>; retry: () => Promise<void>; deviceChoices: () => ExperiencePreferences }
const ExperienceContext = createContext<Context | null>(null)
const changedEvent = 'consumit:experience-changed'

export function ExperienceProvider({ memberId, status, children }: { memberId: string | null; status: string; children: ReactNode }) {
  const [state, setState] = useState<State>({ owner: memberId, preferences: defaultExperiencePreferences(), ready: false, saved: false, error: null })
  const current = useRef(state)
  const scope = useRef({ owner: memberId, controller: new AbortController(), revision: 0 })
  const pending = useRef<ExperiencePatch>({})
  const chain = useRef(Promise.resolve())
  const publish = useCallback((next: State) => {
    const stored = storeExperience(next.owner, next.preferences)
    const published = !stored && !next.owner ? { ...next, error: 'Device storage is unavailable. Your choices work for this visit; they cannot be kept after closing the site.' } : next
    current.current = published
    setState(published)
    window.dispatchEvent(new CustomEvent<State>(changedEvent, { detail: published }))
  }, [])

  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<State>).detail
      const active = scope.current
      if (!next || active.controller.signal.aborted || next.owner !== active.owner || next === current.current) return
      // A dismissal can arrive while its originating scope is still loading.
      // Only a hydrated snapshot can replace this scope's bootstrap request.
      if (next.ready) active.revision++
      const shared = next.ready ? next.preferences : { ...current.current.preferences, guideVersion: next.preferences.guideVersion, guideStatus: next.preferences.guideStatus }
      const merged = { ...next, ready: next.ready || current.current.ready, preferences: experiencePreferencesSchema.parse({ ...shared, ...pending.current }) }
      current.current = merged; setState(merged)
    }
    window.addEventListener(changedEvent, receive)
    const storage = (event: StorageEvent) => {
      if (event.key !== experienceStorageKey(scope.current.owner) || !event.newValue) return
      let raw: unknown
      try { raw = JSON.parse(event.newValue) } catch { return }
      const parsed = experiencePreferencesSchema.safeParse(raw)
      if (!parsed.success) return
      const next = { ...current.current, preferences: experiencePreferencesSchema.parse({ ...parsed.data, ...pending.current }) }
      current.current = next; setState(next)
    }
    window.addEventListener('storage', storage)
    return () => { window.removeEventListener(changedEvent, receive); window.removeEventListener('storage', storage) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    scope.current.controller.abort()
    scope.current = { owner: memberId, controller, revision: scope.current.revision + 1 }
    const revision = scope.current.revision
    pending.current = readPendingExperience(memberId); chain.current = Promise.resolve()
    if (status === 'loading' || status === 'unavailable') return () => controller.abort()
    const preferences = readExperience(memberId)
    // Capture legacy guest choices before the member bridge can touch old device keys.
    if (memberId) storeExperience(null, readExperience(null))
    const local: State = { owner: memberId, preferences, ready: !memberId, saved: false, error: null }
    current.current = local
    // Bootstrap from a bounded private request; another account's values never seed this scope.
    queueMicrotask(() => { if (!controller.signal.aborted && revision === scope.current.revision) { setState(current.current); if (!memberId) applyPlayerDefaults(preferences) } })
    if (memberId) {
      void experienceRequest(controller.signal).then(result => {
        if (controller.signal.aborted || revision !== scope.current.revision) return
        const next = { ...local, preferences: experiencePreferencesSchema.parse({ ...(result.saved ? result.preferences : preferences), ...pending.current }), ready: true, saved: result.saved,
          error: Object.keys(pending.current).length ? 'Some choices are kept on this device. Retry to sync them to your account.' : null }
        publish(next); applyPlayerDefaults(next.preferences)
      }, () => {
        if (controller.signal.aborted || revision !== scope.current.revision) return
        publish({ ...local, ready: true, error: 'Your account preferences could not load. Using this account’s device choices.' })
        applyPlayerDefaults(preferences)
      })
    }
    return () => controller.abort()
  }, [memberId, status, publish])

  const patch = useCallback(async (change: ExperiencePatch) => {
    const active = scope.current
    const guideOnly = Object.keys(change).every(key => key === 'guideVersion' || key === 'guideStatus')
    if (active.owner !== current.current.owner || (!current.current.ready && !guideOnly)) throw new Error('Preferences are still loading. Try again.')
    active.revision++
    pending.current = { ...pending.current, ...change }
    storePendingExperience(active.owner, pending.current)
    const optimistic = { ...current.current, preferences: experiencePreferencesSchema.parse({ ...current.current.preferences, ...change, ...(hasPlaybackPreferences(change) ? { playbackConfigured: true } : {}) }), error: null }
    publish(optimistic)
    if (!active.owner) { pending.current = {}; applyPlayerDefaults(optimistic.preferences); return }
    const run = async () => {
      if (active.controller.signal.aborted) throw new DOMException('Preference request canceled.', 'AbortError')
      const payload = { ...pending.current }
      if (!Object.keys(payload).length) return
      try {
        const result = await experienceRequest(active.controller.signal, payload)
        if (active.controller.signal.aborted) throw new DOMException('Preference request canceled.', 'AbortError')
        for (const key of Object.keys(payload) as (keyof ExperiencePatch)[]) {
          if (JSON.stringify(pending.current[key]) === JSON.stringify(payload[key])) delete pending.current[key]
        }
        storePendingExperience(active.owner, pending.current)
        publish({ ...current.current, preferences: experiencePreferencesSchema.parse({ ...result.preferences, ...pending.current }), ready: true, saved: true, error: null })
      } catch (error) {
        if (active.controller.signal.aborted) throw error
        publish({ ...current.current, ready: true, error: 'Your choices are kept on this device. Retry to sync them to your account.' })
        throw error
      }
    }
    const task = chain.current.then(run, run)
    chain.current = task.catch(() => {})
    await task
  }, [publish])
  const retry = useCallback(async () => {
    if (Object.keys(pending.current).length) return patch(pending.current)
    const active = scope.current
    if (!active.owner) return
    const result = await experienceRequest(active.controller.signal)
    if (!active.controller.signal.aborted) publish({ ...current.current, preferences: result.saved ? result.preferences : current.current.preferences, ready: true, saved: result.saved, error: null })
  }, [patch, publish])
  const value = useMemo(() => ({ ...state, ready: state.ready && state.owner === memberId && status !== 'loading' && status !== 'unavailable', patch, retry, deviceChoices: () => readExperience(null) }), [state, memberId, status, patch, retry])
  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>
}
export function useExperience() {
  const value = useContext(ExperienceContext)
  if (!value) throw new Error('ExperienceProvider is required.')
  return value
}
export function useOptionalExperience() { return useContext(ExperienceContext) }
