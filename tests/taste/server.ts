import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createFakeIdentity } from '../../apps/api/src/identity/fake-identity'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import { createPostgresMemberData } from '../../apps/api/src/member-data/postgres-member-data'
import { createPublicMembers } from '../../apps/api/src/member-data/public-members'
import { createTasteRepository } from '../../apps/api/src/taste/repository'
import { createDbClient } from '../../apps/api/src/db/client'
import { movieDetail } from '../../apps/web/src/test/catalog-fixtures'
import { tasteEditionSchema, tastePresentationSchema, tasteListWriteSchema, tasteReviewWriteSchema, defaultProfileSectionVisibility } from '../../packages/contracts/src/index'

const url = process.env.DATABASE_URL
if (!url || !new URL(url).pathname.endsWith('_taste_test')) throw new Error('Use a dedicated *_taste_test database for the browser fixture.')
const db = createDbClient(url), prisma = db.prisma
await prisma.$executeRawUnsafe('TRUNCATE "Member", "TasteModeration" CASCADE')
const identity = createFakeIdentity(), taste = createTasteRepository(prisma), memberData = createPostgresMemberData(prisma)
async function register(username: string, name: string) {
  const email = `${username}@example.test`
  await identity.register({ username, email, password: 'taste-fixture-password' })
  const delivery = identity.notifier.deliveries.findLast(item => item.kind === 'verification')!
  if (!('code' in delivery)) throw new Error('Missing code')
  const account = await identity.verifyEmail({ email, code: delivery.code })
  await identity.updateProfile(account.sessionToken, { displayName: name, bio: 'For the quiet scenes, the strange worlds, and everything that stays.', visibility: 'public' })
  await prisma.member.create({ data: { id: account.member.id, email, profile: { create: { username, displayName: name, bio: 'For the quiet scenes, the strange worlds, and everything that stays.', visibility: 'public', sectionVisibility: { ...defaultProfileSectionVisibility(), reviews: true, lists: true, favorites: true, ratings: true, diary: true }, avatarUrl: 'http://127.0.0.1:28114/assets/hamza-avatar.svg' } } } })
  return account
}
const owner = await register('samira', 'Samira'), viewer = await register('reader', 'Alex')
const names = ['Violet Hours', 'Northbound', 'Saltwater', 'The Third Sun']
const posters = ['violet-hours', 'northbound', 'saltwater', 'third-sun']
const titles = names.map((title, index) => ({ ...movieDetail, id: 800 + index, title, originalTitle: title, year: 2020 + index, backdropUrl: 'http://127.0.0.1:28114/assets/cinematic-backdrop.svg', posterUrl: `http://127.0.0.1:28114/assets/posters/${posters[index]}.svg`, genreNames: ['Drama'] }))
for (let index = 0; index < titles.length; index++) {
  await prisma.favorite.create({ data: { memberId: owner.member.id, catalogKind: 'MOVIE', tmdbId: titles[index]!.id, position: index + 1 } })
  await prisma.rating.create({ data: { memberId: owner.member.id, catalogKind: 'MOVIE', tmdbId: titles[index]!.id, value: 10 - index } })
}
await prisma.rating.create({ data: { memberId: viewer.member.id, catalogKind: 'MOVIE', tmdbId: 800, value: 9 } })
await prisma.follow.create({ data: { followerId: viewer.member.id, followingId: owner.member.id } })
await taste.publishReview(owner.member.id, tasteReviewWriteSchema.parse({ kind: 'movie', id: 800, body: 'Some films tell you where to look. This one teaches you how to see.\n\nI keep coming back to the silence between the conversations, the light on the windows, the feeling that an ordinary evening could hold an entire life.', rating: 10, idempotencyKey: crypto.randomUUID() }))
const review = await prisma.review.findFirstOrThrow()
const list = await memberData.createList(owner.member.id, { name: 'For the last train home', description: 'Four films for the hours when the city belongs to someone else. A small journey from restlessness to wonder.', visibility: 'public', idempotencyKey: crypto.randomUUID() })
await taste.saveList(owner.member.id, list.list.id, tasteListWriteSchema.parse({ revision: (await taste.listLayout(list.list.id, owner.member.id)).revision, name: list.list.name, description: list.list.description, visibility: 'public', items: titles.map((t, i) => ({ id: t.id, kind: 'movie', note: ['A city can be a feeling.', 'A journey with no need to arrive.', 'Let the silence do the talking.', 'End with something impossible.'][i] })), layout: { genres: ['Drama'], preset: 'watch-order', cover: { kind: 'movie', id: 800 }, chapters: [{ id: 'night', name: 'After the city sleeps', introduction: 'The best stories begin after the last light goes out.' }], assignments: { 'movie:802': 'night', 'movie:803': 'night' } }, publishUpdate: true }))
await taste.saveEdition(owner.member.id, tasteEditionSchema.parse({ month: '2026-10', title: 'The art of slowing down', introduction: 'October was a month of small discoveries. Three stories that reminded me to look a little closer.', cover: { kind: 'movie', id: 800 }, picks: titles.slice(0,3).map(t => ({ kind: 'movie', id: t.id, reason: `For the way ${t.title} makes an ordinary moment feel unforgettable.` })), reviewId: review.id, listId: list.list.id }), 0, true)
await taste.savePresentation(owner.member.id, tastePresentationSchema.parse({ cover: { kind: 'movie', id: 800 }, statement: 'Collecting the moments between the plot.', featuredLists: [list.list.id], featuredReview: review.id }), 0)
const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'http://127.0.0.1:28114' }), identity, memberData, publicMembers: createPublicMembers(prisma), taste, catalog: createFakeCatalog({ titles }), enableRateLimit: false })
app.get('/__fixtures/session/:name', async r => ({ token: (r.params as { name: string }).name === 'owner' ? owner.sessionToken : viewer.sessionToken, list: list.list.slug, review: review.id }))
await app.listen({ host: '127.0.0.1', port: 18563 })

