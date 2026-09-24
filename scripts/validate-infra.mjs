import { spawnSync } from 'node:child_process'

for (const command of ['docker', 'terraform']) {
  const probe = spawnSync(command, ['version'], { stdio: 'ignore', shell: process.platform === 'win32' })
  if (probe.status !== 0) {
    console.error(`Infrastructure validation requires ${command} on PATH. Install it and rerun bun run infra:validate.`)
    process.exit(1)
  }
}

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run('docker', ['compose', '-f', 'compose.yaml', '-f', 'compose.production.yaml', 'config', '--quiet'])
run('terraform', ['fmt', '-check', '-recursive'], 'infra/cloudflare')
run('terraform', ['init', '-backend=false'], 'infra/cloudflare')
run('terraform', ['validate'], 'infra/cloudflare')
