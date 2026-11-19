import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { defaultProfileSectionVisibility, tasteEditionSchema, tasteListWriteSchema, tastePresentationSchema, tasteReviewWriteSchema } from '@consumit/contracts'
import { createDbClient } from '../db/client.ts'
import { createPostgresMemberData } from '../member-data/postgres-member-data.ts'
import { createTasteRepository } from './repository.ts'

const url = process.env.DATABASE_URL!
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Taste tests require a dedicated *_test database.')
const db = createDbClient(url), prisma = db.prisma, repo = createTasteRepository(prisma)
beforeEach(async () => { await prisma.$executeRawUnsafe('TRUNCATE "Member", "TasteModeration" CASCADE') })
afterAll(async () => { await db.close() })
async function member(username: string) {
  return prisma.member.create({ data: { email: `${username}@example.test`, profile: { create: { username, sectionVisibility: { ...defaultProfileSectionVisibility(), reviews: true, lists: true, ratings: true, favorites: true } } } } })
}
const reviewInput = (extra = {}) => tasteReviewWriteSchema.parse({ kind: 'movie', id: 42, body: 'Every frame feels like a memory.', rating: 9, idempotencyKey: randomUUID(), ...extra })
const edition = () => tasteEditionSchema.parse({ month: '2026-10', title: 'After the last train', picks: [{ kind: 'movie', id: 42, reason: 'The light.' }, { kind: 'series', id: 42, reason: 'The characters.' }, { kind: 'anime', id: 42, reason: 'The world.' }] })

describe('taste publications with PostgreSQL', () => {
  it('sends a private title card only to a followed member and records their choice', async () => {
    const sender = await member('recommender'), recipient = await member('recipient'), stranger = await member('stranger')
    await prisma.follow.create({ data: { followerId: sender.id, followingId: recipient.id } })
    const card = await repo.sendRecommendation(sender.id, recipient.id, { kind: 'anime', id: 42 })
    expect(await repo.sendRecommendation(sender.id, recipient.id, { kind: 'anime', id: 42 })).toEqual(card)
    expect(await prisma.tasteRecommendation.count()).toBe(1)
    expect(await repo.recommendations(recipient.id)).toMatchObject({ items: [{ id: card.id, title: { kind: 'anime', id: 42 }, sender: { id: sender.id }, response: null }] })
    expect(await repo.recommendations(sender.id)).toEqual({ items: [], nextCursor: null })
    await expect(repo.sendRecommendation(sender.id, stranger.id, { kind: 'movie', id: 42 })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(repo.respondToRecommendation(stranger.id, card.id, 'saved')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await repo.respondToRecommendation(recipient.id, card.id, 'already-seen')
    expect((await repo.recommendations(recipient.id)).items[0]?.response).toBe('already-seen')
    await repo.block(recipient.id, sender.id, true)
    expect(await repo.recommendations(recipient.id)).toEqual({ items: [], nextCursor: null })
    await expect(repo.respondToRecommendation(recipient.id, card.id, 'saved')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('atomically retries a log once and edits its review without writing another watch', async () => {
    const owner = await member('curator')
    const input = reviewInput({ kind: 'series', season: 1, episode: 2, log: { watchedOn: '2026-10-20', rewatch: false, tags: ['night'] } })
    const results = await Promise.all([repo.publishReview(owner.id, input), repo.publishReview(owner.id, input)])
    expect(results[0]).toEqual(results[1])
    expect(await prisma.diaryEntry.count()).toBe(1)
    const review = await prisma.review.findFirstOrThrow()
    expect(review).toMatchObject({ season: 1, episode: 2, ratingAtPublication: 9 })
    await repo.publishReview(owner.id, reviewInput({ kind: 'series', season: 1, episode: 2, reviewId: review.id, revision: 0, rating: 8, body: 'A second reading.' }))
    expect(await prisma.diaryEntry.count()).toBe(1)
    expect(await prisma.playbackProgress.count()).toBe(0)
    expect(await prisma.review.count()).toBe(1)
    await repo.publishReview(owner.id, reviewInput({ kind: 'series', reviewId: review.id, revision: 1, rating: 8, body: 'Edited from title details without a scope change.' }))
    expect(await prisma.review.findUnique({ where: { id: review.id } })).toMatchObject({ season: 1, episode: 2 })
    await expect(repo.publishReview(owner.id, { ...input, body: 'A different request.' })).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(repo.publishReview(owner.id, reviewInput({ kind: 'series', reviewId: review.id, revision: 0, rating: 1 }))).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await prisma.rating.findFirstOrThrow()).value).toBe(8)
  })

  it('serves stable review pages publicly when the author enables Reviews visibility', async () => {
    const owner = await member('public-review-owner'), reader = await member('public-review-reader')
    await repo.publishReview(owner.id, reviewInput())
    const review = await prisma.review.findFirstOrThrow()

    expect(await repo.review(review.id)).toMatchObject({ reviewId: review.id, owner: false, liked: false })
    expect(await repo.review(review.id, reader.id)).toMatchObject({ reviewId: review.id, owner: false })
    await repo.block(reader.id, owner.id, true)
    await expect(repo.review(review.id, reader.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await repo.block(reader.id, owner.id, false)

    await prisma.profile.update({ where: { memberId: owner.id }, data: { sectionVisibility: { ...defaultProfileSectionVisibility(), reviews: false } } })
    await expect(repo.review(review.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(repo.review(review.id, reader.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await repo.review(review.id, owner.id)).toMatchObject({ reviewId: review.id, owner: true })
  })

  it('isolates drafts by member, checks revisions and keeps draft changes separate from published editions', async () => {
    const owner = await member('curator'), other = await member('reader')
    await repo.saveDraft(owner.id, 'review-series-42-1-2-new', { body: 'Episode two.' }, 0)
    expect(await repo.draft(other.id, 'review-series-42-1-2-new')).toEqual({ revision: 0, data: {} })
    await expect(repo.saveDraft(owner.id, 'review-series-42-1-2-new', {}, 0)).rejects.toMatchObject({ code: 'CONFLICT' })
    const first = await repo.saveEdition(owner.id, edition(), 0, true)
    await repo.saveEdition(owner.id, { ...edition(), title: 'Unfinished private changes' }, first.revision, false)
    expect((await repo.edition('curator', '2026-10')).data.title).toBe('After the last train')
    expect((await repo.edition('curator', '2026-10', owner.id, true)).data.title).toBe('Unfinished private changes')
    await expect(repo.edition('curator', '2026-10', other.id, true)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(repo.saveEdition(owner.id, { ...edition(), picks: [] }, 2, true)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await repo.unpublishEdition(owner.id, '2026-10')
    await expect(repo.edition('curator', '2026-10')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rechecks section privacy for reviews, features, sharing and notifications', async () => {
    const owner = await member('curator'), reader = await member('reader')
    await repo.subscribe(reader.id, { kind: 'member', id: owner.id }, 'updates')
    await repo.publishReview(owner.id, reviewInput({ spoiler: true }))
    const row = await prisma.review.findFirstOrThrow()
    const shared = await repo.share('review', row.id)
    expect(shared.description).not.toContain('Every frame')
    expect((await repo.notifications(reader.id)).items).toHaveLength(1)
    await repo.savePresentation(owner.id, tastePresentationSchema.parse({ featuredReview: row.id }), 0)
    await prisma.profile.update({ where: { memberId: owner.id }, data: { sectionVisibility: { ...defaultProfileSectionVisibility(), reviews: false } } })
    await expect(repo.review(row.id, reader.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(repo.share('review', row.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await repo.profile('curator', reader.id)).presentation.featuredReview).toBeNull()
    expect((await repo.notifications(reader.id)).items[0]?.href).toBeNull()
    expect((await repo.review(row.id, owner.id)).body).toContain('Every frame')
  })

  it('uses exact title kinds for taste comparisons', async () => {
    const owner = await member('curator'), reader = await member('reader')
    await prisma.rating.createMany({ data: [{ memberId: owner.id, catalogKind: 'ANIME', tmdbId: 42, value: 10 }, { memberId: reader.id, catalogKind: 'MOVIE', tmdbId: 42, value: 10 }] })
    expect((await repo.profile('curator', reader.id)).comparison?.compared).toBe(0)
    await prisma.rating.create({ data: { memberId: reader.id, catalogKind: 'ANIME', tmdbId: 42, value: 5 } })
    expect((await repo.profile('curator', reader.id)).comparison?.differences).toEqual([{ kind: 'anime', id: 42, yours: 5, theirs: 10 }])
  })

  it('keeps chapters on duplication, rejects stale list writes and limits editor visibility changes', async () => {
    const owner = await member('curator'), editor = await member('editor')
    const legacy = createPostgresMemberData(prisma)
    const list = await legacy.createList(owner.id, { name: 'Night journeys', visibility: 'public', idempotencyKey: randomUUID() })
    const input = tasteListWriteSchema.parse({ revision: (await repo.listLayout(list.list.id, owner.id)).revision, name: list.list.name, description: 'A journey in three parts.', visibility: 'public', items: [{ kind: 'movie', id: 42, note: 'Stay until the credits.' }], layout: { preset: 'watch-order', cover: { kind: 'movie', id: 42 }, chapters: [{ id: 'night', name: 'Night', introduction: 'When the city slows.' }], assignments: { 'movie:42': 'night' } }, publishUpdate: true })
    await repo.saveList(owner.id, list.list.id, input)
    await expect(repo.saveList(owner.id, list.list.id, input)).rejects.toMatchObject({ code: 'CONFLICT' })
    const copy = await legacy.duplicateList!(editor.id, list.list.slug, { visibility: 'private', idempotencyKey: randomUUID() })
    expect((await repo.listLayout(copy!.list.id, editor.id)).layout).toEqual(input.layout)
    expect(copy!.items[0]?.note).toBe('Stay until the credits.')
    await legacy.addListCollaborator!(owner.id, list.list.id, { username: 'editor' })
    await expect(repo.saveList(editor.id, list.list.id, { ...input, revision: (await repo.listLayout(list.list.id, editor.id)).revision, visibility: 'private' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(repo.share('list', copy!.list.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('deduplicates comments, limits reply depth, restores subscriptions and respects mute and blocks', async () => {
    const owner = await member('curator'), reader = await member('reader')
    await repo.publishReview(owner.id, reviewInput())
    const row = await prisma.review.findFirstOrThrow(), target = { kind: 'review' as const, id: row.id }
    const input = { body: 'That final image.', spoiler: true, parentId: null, idempotencyKey: randomUUID() }
    const first = await repo.comment(reader.id, target, input)
    expect(await repo.comment(reader.id, target, input)).toEqual(first)
    const reply = await repo.comment(owner.id, target, { ...input, body: 'It stays with you.', parentId: first.id, idempotencyKey: randomUUID() })
    await expect(repo.comment(reader.id, target, { ...input, parentId: reply.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await repo.subscribe(owner.id, target, 'mute')
    await repo.readNotifications(owner.id)
    await repo.comment(reader.id, target, { ...input, body: 'Another thought.', idempotencyKey: randomUUID() })
    expect((await repo.notifications(owner.id)).items.every(n => n.read)).toBe(true)
    await repo.subscribe(reader.id, target, 'updates')
    expect(await repo.subscription(reader.id, target)).toEqual({ subscribed: true, muted: false })
    await repo.subscribe(reader.id, target, 'mute')
    expect(await repo.subscription(reader.id, target)).toEqual({ subscribed: true, muted: true })
    await repo.subscribe(reader.id, target, 'unmute')
    await repo.subscribe(reader.id, target, 'off')
    expect(await repo.subscription(reader.id, target)).toEqual({ subscribed: false, muted: false })
    await repo.block(reader.id, owner.id, true)
    await expect(repo.discussion(target, reader.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await repo.notifications(owner.id)).items).toEqual([])
  })

  it('makes comment deletion idempotent after the server commits but the response is lost', async () => {
    const owner = await member('comment-owner'), writer = await member('comment-writer')
    await repo.publishReview(owner.id, reviewInput())
    const review = await prisma.review.findFirstOrThrow()
    const comment = await repo.comment(writer.id, { kind: 'review', id: review.id }, {
      body: 'A comment that can be removed.', spoiler: false, parentId: null, idempotencyKey: randomUUID(),
    })

    await repo.editComment(writer.id, comment.id, null)
    await expect(repo.editComment(writer.id, comment.id, null)).resolves.toBeUndefined()
    expect(await prisma.tasteComment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({ deleted: true, body: '', revision: 1 })
  })

  it('shows moderation evidence and removes reported content from public reads with an audit record', async () => {
    const owner = await member('curator'), reporter = await member('reporter'), admin = await member('moderator')
    await repo.publishReview(owner.id, reviewInput())
    const row = await prisma.review.findFirstOrThrow()
    const reportTarget = { kind: 'review' as const, id: row.id }
    const reportKey = randomUUID()
    await repo.report(reporter.id, reportTarget, 'Please review this content.', undefined, reportKey)
    await repo.report(reporter.id, reportTarget, 'Please review this content.', undefined, reportKey)
    expect(await prisma.tasteReport.count()).toBe(1)
    await expect(repo.report(reporter.id, reportTarget, 'A different reason for the same key.', undefined, reportKey)).rejects.toMatchObject({ code: 'CONFLICT' })
    const report = (await repo.reports()).items[0]!
    expect(report.content).toBe(row.body)
    expect(report.href).toBe(`/reviews/${row.id}`)
    await repo.moderate(admin.id, report.id, 'remove', 'Removed after review.')
    await expect(repo.review(row.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await prisma.tasteModeration.count()).toBe(1)
    expect((await repo.reports()).items).toEqual([])
    await repo.moderate(admin.id, report.id, 'restrict', 'Publishing restricted.')
    await expect(repo.publishReview(owner.id, reviewInput())).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await repo.reports()).items[0]?.status).toBe('restrict')
    await repo.moderate(admin.id, report.id, 'restore', 'Restriction reviewed and lifted.')
    await expect(repo.publishReview(owner.id, reviewInput())).resolves.toBeDefined()
  })
})
