import { spawnSync } from 'node:child_process'

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run('docker', ['compose', '-f', 'compose.yaml', '-f', 'compose.production.yaml', 'config', '--quiet'])
run('terraform', ['fmt', '-check', '-recursive'], 'infra/cloudflare')
run('terraform', ['init', '-backend=false'], 'infra/cloudflare')
run('terraform', ['validate'], 'infra/cloudflare')
