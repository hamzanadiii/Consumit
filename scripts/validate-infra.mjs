import path from 'node:path'
import { spawnSync } from 'node:child_process'

function commandWorks(command) {
  const probe = spawnSync(command, ['version'], { stdio: 'ignore' })
  return probe.status === 0
}

if (!commandWorks('docker')) {
  console.error('Infrastructure validation requires Docker Compose on PATH. Install Docker and rerun bun run infra:validate.')
  process.exit(1)
}

const useTerraformContainer = !commandWorks('terraform')
const terraformImage = process.env.CONSUMIT_TERRAFORM_IMAGE?.trim() || 'hashicorp/terraform:1.8.5'
const projectRoot = process.cwd()
const cloudflareDir = path.resolve(projectRoot, 'infra/cloudflare')

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const runTerraform = (args) => {
  if (!useTerraformContainer) {
    run('terraform', args, cloudflareDir)
    return
  }
  run('docker', [
    'run', '--rm',
    '--mount', `type=bind,source=${cloudflareDir.replaceAll('\\', '/')},target=/workspace`,
    '--workdir', '/workspace',
    terraformImage,
    ...args,
  ], projectRoot)
}

run('docker', ['compose', '-f', 'compose.yaml', '-f', 'compose.production.yaml', 'config', '--quiet'])
run('docker', ['compose', '-f', 'compose.yaml', '-f', 'compose.playback.yaml', '--profile', 'playback', 'config', '--quiet'])
runTerraform(['fmt', '-check', '-recursive'])
runTerraform(['init', '-backend=false'])
runTerraform(['validate'])
