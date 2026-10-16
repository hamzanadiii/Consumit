// Controlled catalog transport for the actual immutable Node entrypoints.
if (process.env.CONSUMIT_CONTROLLED_FIXTURES !== '1' || !new URL(process.env.DATABASE_URL || 'http://invalid').pathname.endsWith('_test')) throw new Error('Image fixtures require an explicit dedicated test database.')
const original = globalThis.fetch
const page = results => ({ page: 1, results, total_pages: results.length ? 1 : 0, total_results: results.length })
const movie = { id: 693134, adult: false, title: 'Dune: Part Two', original_title: 'Dune: Part Two', release_date: '2024-02-27', overview: 'A controlled playback fixture.', popularity: 100, vote_average: 8.2, vote_count: 7500, poster_path: null, backdrop_path: null, genre_ids: [18], genres: [{ id: 18, name: 'Drama' }], credits: { cast: [], crew: [] }, images: { logos: [], backdrops: [] }, recommendations: page([]), release_dates: { results: [] }, homepage: null, runtime: 166, spoken_languages: [{ english_name: 'English' }], production_countries: [{ name: 'United States of America' }], status: 'Released', tagline: null }
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname === 'api.themoviedb.org') {
    let body
    if (url.pathname === '/3/configuration') body = { images: { backdrop_sizes: ['w1280', 'original'], logo_sizes: ['w500', 'original'], poster_sizes: ['w500', 'original'], profile_sizes: ['w185', 'original'], still_sizes: ['w780', 'original'], secure_base_url: 'https://image.tmdb.org/t/p/' } }
    else if (url.pathname.includes('/genre/')) body = { genres: [{ id: 18, name: 'Drama' }] }
    else if (url.pathname === '/3/movie/693134') body = movie
    else if (/\/movie|\/multi/.test(url.pathname)) body = page([{ ...movie, media_type: 'movie' }])
    else body = page([])
    return Response.json(body)
  }
  if (url.hostname === 'graphql.anilist.co') return Response.json({ data: { Page: { media: [], pageInfo: { total: 0, lastPage: 0, hasNextPage: false } }, Media: null, AiringSchedule: { nodes: [], pageInfo: { total: 0, lastPage: 0, hasNextPage: false } } } })
  if (url.protocol === 'http:' && ['api', 'playback', 'collector', '127.0.0.1', 'localhost'].includes(url.hostname)) return original(input, init)
  throw new Error('Unexpected controlled-fixture egress.')
}
