import { EmbedPlayer } from '../../embed-player'

interface EmbedSource {
  url: string
  type: string
  quality: string
  provider: string
  headers: Record<string, string>
}

interface EmbedSub {
  url: string
  label: string
  format: string
}

async function fetchStreams(apiBaseUrl: string, tmdbId: string) {
  const path = `/v1/embed/movie/${tmdbId}`
  try {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function EmbedMoviePage({ params }: { params: Promise<{ tmdbId: string }> }) {
  const { tmdbId } = await params
  const apiBaseUrl = process.env.CONSUMIT_API_URL || 'http://127.0.0.1:3001'
  const data = await fetchStreams(apiBaseUrl, tmdbId)

  if (!data?.success || !data.sources?.length) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', fontFamily: 'system-ui' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No streams available</div>
          <div style={{ fontSize: '0.8rem', color: '#888' }}>Try again later</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <EmbedPlayer
        sources={data.sources.map((s: EmbedSource) => ({
          url: s.url,
          type: s.type as 'hls' | 'dash' | 'native',
          quality: s.quality,
          provider: s.provider,
          headers: s.headers,
        }))}
        subtitles={data.subtitles?.map((s: EmbedSub) => ({
          url: s.url,
          label: s.label,
          format: s.format as 'vtt' | 'srt',
        })) || []}
        autoPlay
      />
    </div>
  )
}
