'use client'
import { createWatchPlayback } from '@consumit/web-core/client/watch-playback'
import { Button, ConsumitPlayer, Toggle, buttonVariants, SUBTITLE_LANGUAGES_EVENT, readStoredSubtitleLanguages, readQualityPreference, createQualityPreference } from '@consumit/ui'
import { ProviderFrame } from '../shared/provider-frame'
export const WatchPlayback = createWatchPlayback({ Button, ConsumitPlayer, Toggle, buttonVariants, SUBTITLE_LANGUAGES_EVENT, readStoredSubtitleLanguages, readQualityPreference, createQualityPreference, ProviderFrame, pauseTitle: true })
