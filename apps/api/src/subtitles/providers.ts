import { createAddic7edProvider } from './addic7ed.ts'
import { createBanimeProvider } from './banime.ts'
import { createCastleSubsProvider } from './castlesubs.ts'
import { createAnimeToshoProvider } from './animetosho.ts'
import { createJimakuProvider } from './jimaku.ts'
import { createMeguAnimeProvider } from './meguanime.ts'
import { createNatsukiProvider } from './natsuki.ts'
import { createNxshaSubsProvider } from './nxshasubs.ts'
import { createRiveSubsProvider } from './rivesubs.ts'
import { createOpenSubtitlesProvider } from './opensubtitles.ts'
import { createSubDlProvider } from './subdl.ts'
import { createSubSourceProvider } from './subsource.ts'
import { createTvSubtitlesProvider } from './tvsubtitles.ts'
import { createVdrkProvider } from './vdrk.ts'
import { createVdrkV2Provider } from './vdrkv2.ts'
import { createYifyProvider } from './yify.ts'
import { createSubtitleHttp } from './http.ts'
import type { MediaTransport } from '../playback/transport.ts'
import type { ApiEnv } from '../config/env.ts'

/** One compiled roster shared by local fixtures and the subtitle Worker. */
export function createSubtitleProviders(keys: ApiEnv['subtitleKeys'], transport?: MediaTransport) {
  const http = (hosts: readonly string[]) => createSubtitleHttp(hosts, transport)
  return [
      createYifyProvider(http(['yifysubtitles.ch'])),
      createTvSubtitlesProvider(http(['www.tvsubtitles.net'])),
      createAnimeToshoProvider(http(['api.ani.zip', 'feed.animetosho.xyz', 'feed.animetosho.net'])),
      createSubSourceProvider(http(['subsource.net'])),
      createCastleSubsProvider(http(['api.hlowb.com'])),
      createNxshaSubsProvider(http(['nxsha.space'])),
      createVdrkProvider(http(['sub.vdrk.site'])),
      createVdrkV2Provider(http(['sub.vdrk.site'])),
      createRiveSubsProvider(http(['scrapper.rivestream.app'])),
      createNatsukiProvider(http(['natsuki.hls.lol'])),
      createAddic7edProvider(http(['addic7ed.com', 'www.addic7ed.com'])),
      createMeguAnimeProvider(http(['meguanime.com'])),
      createBanimeProvider(http(['banime.dedyn.io'])),
      // Key-gated providers decline without credentials (no keys set).
      createSubDlProvider(http(['api.subdl.com']), keys.subdl),
      createJimakuProvider(http(['jimaku.cc']), keys.jimaku),
      createOpenSubtitlesProvider(http(['api.opensubtitles.com']), keys.openSubtitles),
  ]
}
