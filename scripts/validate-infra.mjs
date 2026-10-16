import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { assertProductionBackupConfig, assertProductionRuntimeConfig, productionProcessEnvironment } from './production-config.mjs'

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
let terraformDir = path.resolve(projectRoot, 'infra/cloudflare')

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const runTerraform = (args) => {
  if (!useTerraformContainer) {
    run('terraform', args, terraformDir)
    return
  }
  run('docker', [
    'run', '--rm',
    '--mount', `type=bind,source=${terraformDir.replaceAll('\\', '/')},target=/workspace`,
    '--workdir', '/workspace',
    terraformImage,
    ...args,
  ], projectRoot)
}

// Validate production syntax using the committed template, not developer secrets.
const templateFile = path.resolve(projectRoot, '.env.production.example')
const templateEnv = productionProcessEnvironment(process.env, parseEnv(readFileSync(templateFile, 'utf8')), templateFile)
const productionArgs = ['compose', '--env-file', templateFile, '-f', 'compose.yaml', '-f', 'compose.playback.yaml', '-f', 'compose.production.yaml', '--profile', 'backup', 'config']
const productionQuiet = spawnSync('docker', [...productionArgs, '--quiet'], { env: templateEnv, stdio: 'inherit' })
if (productionQuiet.status !== 0) process.exit(productionQuiet.status ?? 1)
const productionConfig = spawnSync('docker', [...productionArgs, '--format', 'json'], { env: templateEnv, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
if (productionConfig.status !== 0) {
  console.error('Production Compose could not be evaluated. Run its config --quiet check for diagnostics.')
  process.exit(1)
}
// Parse privately: Compose output contains credentials and must never be logged.
const evaluatedProduction = JSON.parse(productionConfig.stdout)
assertProductionBackupConfig(evaluatedProduction)
assertProductionRuntimeConfig(evaluatedProduction)
run('docker', ['compose', '-f', 'compose.yaml', '-f', 'compose.playback.yaml', '--profile', 'playback', 'config', '--quiet'])
run('docker', ['compose', '-f', 'compose.yaml', '-f', 'compose.playback.yaml', 'config', '--quiet'])
// Validate the actual image include paths and both gateway configurations.
const gatewayImage = 'consumit-gateway-config-check:local'
run('docker', ['build', '--target', 'gateway', '--tag', gatewayImage, '.'], projectRoot)
run('docker', ['run', '--rm', '--entrypoint', 'nginx', gatewayImage, '-t'], projectRoot)
const devGatewayConfig = path.resolve(projectRoot, 'infra/nginx/consumit.dev.conf').replaceAll('\\', '/')
run('docker', ['run', '--rm', '--mount', `type=bind,source=${devGatewayConfig},target=/etc/nginx/conf.d/default.conf,readonly`, '--entrypoint', 'nginx', gatewayImage, '-t'], projectRoot)
runTerraform(['fmt', '-check', '-recursive'])
runTerraform(['init', '-backend=false'])
runTerraform(['validate'])
terraformDir = path.resolve(projectRoot, 'infra/aws')
runTerraform(['fmt', '-check', '-recursive'])
runTerraform(['init', '-backend=false', '-lockfile=readonly'])
runTerraform(['validate'])
run('docker', ['run', '--rm', '--entrypoint', 'promtool', '--mount', `type=bind,source=${path.resolve(projectRoot, 'infra/observability').replaceAll('\\', '/')},target=/etc/prometheus,readonly`, 'prom/prometheus:v3.14.0', 'check', 'rules', '/etc/prometheus/production-alerts.yml'])
