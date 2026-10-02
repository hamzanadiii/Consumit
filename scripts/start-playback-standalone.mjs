import { cpSync, existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const distDir = process.env.CONSUMIT_NEXT_DIST_DIR ?? '.next-playback-prod'
const outputDir = path.resolve(process.cwd(), distDir)
const standaloneApp = path.join(outputDir, 'standalone', 'apps', 'web')
const standaloneDist = path.join(standaloneApp, path.basename(outputDir))
const serverPath = path.join(standaloneApp, 'server.js')

if (!existsSync(serverPath)) {
  throw new Error(`Standalone playback server not found at ${serverPath}. Build the selected player core first.`)
}

const staticDir = path.join(outputDir, 'static')
if (existsSync(staticDir)) cpSync(staticDir, path.join(standaloneDist, 'static'), { recursive: true, force: true })

const publicDir = path.resolve(process.cwd(), 'public')
if (existsSync(publicDir)) cpSync(publicDir, path.join(standaloneApp, 'public'), { recursive: true, force: true })

const server = spawn(process.execPath, [serverPath], {
  cwd: standaloneApp,
  env: { ...process.env, PORT: process.env.PORT ?? '27911', HOSTNAME: process.env.HOSTNAME ?? '127.0.0.1' },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.kill(signal))
}

server.once('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
server.once('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 0)
})
