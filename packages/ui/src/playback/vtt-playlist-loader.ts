import type { HlsConfig, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js'
import { isSafeMediaUrl } from './media-source'

/** Some adapters declare full VTT documents where HLS expects a subtitle
 *  playlist. Only that text response is wrapped; subtitle/media bytes stay
 *  browser-direct and ordinary HLS playlists retain their original form. */
export function vttSubtitlePlaylist(url: string, text: string): string {
  if (!/^\uFEFF?WEBVTT(?:[ \t\r\n]|$)/.test(text)) return text
  if (text.length > 1024 * 1024 || !isSafeMediaUrl(url) || /[\r\n]/.test(url)) throw new Error('Invalid subtitle playlist')
  let duration = 0, cues = 0
  const ends = text.matchAll(/-->[ \t]+(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})(?:[ \t\r\n]|$)/g)
  for (const end of ends) {
    const hours = Number(end[1] ?? 0), minutes = Number(end[2]), seconds = Number(end[3]), millis = Number(end[4])
    const time = hours * 3600 + minutes * 60 + seconds + millis / 1000
    if (++cues > 50000 || minutes >= 60 || seconds >= 60 || time > 86400) throw new Error('Invalid subtitle duration')
    duration = Math.max(duration, time)
  }
  if (!cues || duration <= 0) throw new Error('Empty subtitle document')
  return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${Math.ceil(duration)}\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:${duration.toFixed(3)},\n${url}\n#EXT-X-ENDLIST\n`
}

export function vttPlaylistLoader(Base: HlsConfig['loader']): HlsConfig['loader'] {
  return class extends Base {
    override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      super.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, loadedContext, details) => {
          try {
            const subtitle = (loadedContext as LoaderContext & { type?: string }).type === 'subtitleTrack'
            const data = subtitle && typeof response.data === 'string' ? vttSubtitlePlaylist(response.url, response.data) : response.data
            callbacks.onSuccess({ ...response, ...(data === undefined ? {} : { data }) }, stats, loadedContext, details)
          } catch { callbacks.onError({ code: 0, text: 'Invalid subtitle playlist' }, loadedContext, details, stats) }
        },
      })
    }
  }
}
