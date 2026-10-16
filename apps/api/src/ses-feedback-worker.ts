import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { metrics } from '@opentelemetry/api'
import { readAwsCredentials } from './config/aws-credentials.ts'
import { feedbackCategory } from './identity/ses-feedback.ts'
import { startPlaybackTelemetry } from './playback/telemetry.ts'

const queueUrl = process.env.SES_FEEDBACK_QUEUE_URL
const credentialsFile = process.env.SES_FEEDBACK_CREDENTIALS_FILE
if (!queueUrl || !credentialsFile || process.env.SES_REGION !== 'ca-central-1') throw new Error('SES feedback requires its private queue, credential file and Canada Central region.')
const client = new SQSClient({ region: 'ca-central-1', maxAttempts: 1, credentials: readAwsCredentials(credentialsFile) })
const telemetry = startPlaybackTelemetry()
const events = metrics.getMeter('consumit-email').createCounter('consumit.email.feedback')
let running = true
const abort = new AbortController()
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { running = false; abort.abort() })
while (running) {
  try {
    const result = await client.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 20, VisibilityTimeout: 60 }), { abortSignal: abort.signal })
    for (const message of result.Messages ?? []) {
      const category = feedbackCategory(message.Body ?? '')
      events.add(1, { outcome: category ?? 'invalid' })
      // Invalid messages stay in the queue and reach the configured DLQ.
      if (category && message.ReceiptHandle) await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }), { abortSignal: abort.signal })
    }
  } catch {
    if (running) {
      events.add(1, { outcome: 'consumer_unavailable' })
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}
client.destroy()
await telemetry.shutdown()
