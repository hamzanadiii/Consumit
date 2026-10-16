import { loadEnv } from '../../api/src/config/env.ts'
import { startPlaybackTelemetry } from '../../api/src/playback/telemetry.ts'
import { buildPlaybackApp } from './app.ts'
const env = loadEnv({ ...process.env, APPLICATION_MODE: 'playback' })
const telemetry = startPlaybackTelemetry()
const app = await buildPlaybackApp(env)
app.addHook('onClose', () => telemetry.shutdown())
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0), () => process.exit(1)) })
await app.listen({ host: '0.0.0.0', port: env.port })

