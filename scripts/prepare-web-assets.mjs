import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const app = process.argv[2]
if (!['web', 'next-web'].includes(app)) throw new Error('Choose web or next-web.')
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const destination = path.join(root, 'apps', app, 'public', 'cast')
mkdirSync(destination, { recursive: true })
for (const name of ['receiver.js', 'receiver.html']) copyFileSync(path.join(root, 'packages/web-core/public/cast', name), path.join(destination, name))
