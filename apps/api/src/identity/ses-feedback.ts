import { z } from 'zod'

const feedbackSchema = z.object({
  eventType: z.enum(['Bounce', 'Complaint', 'Reject', 'Delivery', 'Send', 'Rendering Failure', 'DeliveryDelay']).optional(),
  notificationType: z.enum(['Bounce', 'Complaint', 'Delivery']).optional(),
}).refine(value => value.eventType || value.notificationType)

/** Parse only the event category. Addresses and message content never escape. */
export function feedbackCategory(body: string): string | undefined {
  if (body.length > 262144) return undefined
  try {
    const parsed = feedbackSchema.safeParse(JSON.parse(body))
    return parsed.success ? (parsed.data.eventType ?? parsed.data.notificationType)?.toLowerCase().replaceAll(' ', '_') : undefined
  } catch { return undefined }
}
