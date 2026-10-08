import { expect, it } from 'vitest'
import { feedbackCategory } from './ses-feedback.ts'

it('emits only feedback categories from hostile event bodies', () => {
  expect(feedbackCategory(JSON.stringify({ eventType: 'Bounce', mail: { destination: ['secret@example.test'] } }))).toBe('bounce')
  expect(feedbackCategory(JSON.stringify({ notificationType: 'Complaint' }))).toBe('complaint')
  expect(feedbackCategory('{')).toBeUndefined()
  expect(feedbackCategory(JSON.stringify({ eventType: 'recipient@example.test' }))).toBeUndefined()
  expect(feedbackCategory(' '.repeat(262145))).toBeUndefined()
})
