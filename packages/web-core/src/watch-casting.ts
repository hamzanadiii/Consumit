import type { PlaybackSession } from '@consumit/contracts'
import { castHandoff } from './lib/playback-browser'
import { castContentType, type CastSender } from './lib/cast-sender'

/** Pair protected media without transferring the watching browser's grant. */
export async function loadWatchCastMedia(sender: CastSender, session: PlaybackSession, state: { title: string; artwork?: string | undefined; audioLanguage: string; position: number; playing: boolean }, signal = new AbortController().signal) {
  if (session.source.type === 'iframe') { sender.endSession(true); return }
  const handoffToken = session.source.delivery === 'relay' ? await castHandoff(session, signal) : undefined
  signal.throwIfAborted()
  await sender.loadMedia({
    contentId: handoffToken ? `${window.location.origin}/cast/relay` : session.source.src,
    contentType: castContentType(session.source.type),
    title: state.title, artwork: state.artwork, position: state.position, playing: state.playing,
    customData: {
      ...(handoffToken ? { handoffToken } : {}), sessionId: session.id,
      providerId: session.source.providerId, delivery: session.source.delivery, audioLanguage: state.audioLanguage,
    },
  })
}
