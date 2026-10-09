import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const roots = ['apps/api/src', 'apps/web/src', 'apps/next-web/src', ...readdirSync(path.join(root, 'packages')).map(name => `packages/${name}/src`)]
const files = []
function walk(directory) {
  if (!existsSync(path.join(root, directory))) return
  for (const item of readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${item.name}`
    if (item.isDirectory() && item.name !== 'test') walk(file)
    else if (item.isFile() && /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file)) files.push(file)
  }
}
roots.forEach(walk)
const exceptions = JSON.parse(readFileSync(path.join(root, 'scripts/duplication-exceptions.json'), 'utf8'))
const groups = new Map(), issues = []
const sources = new Map(files.map(file => [file, readFileSync(path.join(root, file), 'utf8')]))
const packages = readdirSync(path.join(root, 'packages')).map(directory => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'packages', directory, 'package.json'), 'utf8'))
  return { directory, ...manifest }
})
const serverModules = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
function localImport(file, specifier) {
  let target
  if (specifier.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
  else if (specifier.startsWith('@/') && /^apps\/(?:web|next-web)\/src\//.test(file)) target = `${file.split('/').slice(0, 3).join('/')}/${specifier.slice(2)}`
  else {
    const workspace = packages.find(item => specifier === item.name || specifier.startsWith(`${item.name}/`))
    if (!workspace) return
    const key = specifier === workspace.name ? '.' : `.${specifier.slice(workspace.name.length)}`
    let entry = workspace.exports?.[key]
    if (!entry) for (const [pattern, value] of Object.entries(workspace.exports ?? {})) {
      if (!pattern.endsWith('*') || typeof value !== 'string' || !key.startsWith(pattern.slice(0, -1))) continue
      entry = value.replace('*', key.slice(pattern.length - 1)); break
    }
    if (typeof entry !== 'string') return
    target = path.posix.normalize(`packages/${workspace.directory}/${entry}`)
  }
  return [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`].find(candidate => sources.has(candidate))
}
const imports = new Map(files.map(file => {
  const syntax = ts.createSourceFile(file, sources.get(file), ts.ScriptTarget.Latest, true)
  const dependencies = []
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.isTypeOnly || node.importClause?.isTypeOnly) return
      const bindings = node.importClause?.namedBindings
      if (!node.importClause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every(item => item.isTypeOnly)) return
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependencies.push(node.moduleSpecifier.text)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) dependencies.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  return [file, dependencies]
}))
const browserRoots = new Set(files.filter(file => /^\s*['"]use client['"]/.test(sources.get(file)) || /packages\/(playback-core|ui-core)\//.test(file)))
for (const workspace of packages) for (const [key, entry] of Object.entries(workspace.exports ?? {})) {
  if (key.startsWith('./client/') && typeof entry === 'string') {
    const file = path.posix.normalize(`packages/${workspace.directory}/${entry}`)
    if (sources.has(file)) browserRoots.add(file)
  }
}
const checkedBrowserFiles = new Set()
function checkBrowser(file, chain) {
  if (checkedBrowserFiles.has(file)) return
  checkedBrowserFiles.add(file)
  for (const specifier of imports.get(file) ?? []) {
    if (serverModules.has(specifier) || specifier === 'server-only' || /^(node:|next\/(headers|server)$|@consumit\/web-core\/server\/)/.test(specifier)) {
      issues.push(`Browser import crosses the server boundary: ${[...chain, file, specifier].join(' -> ')}`)
      continue
    }
    const target = localImport(file, specifier)
    if (target) checkBrowser(target, [...chain, file])
  }
}
for (const file of browserRoots) checkBrowser(file, [])
for (const file of files) {
  const source = readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
  if (/packages\/(playback-core|ui-core|web-core)\//.test(file) && /(?:from\s*|import\s*)['"][^'"]*(?:apps\/|@\/)/.test(source)) issues.push(`${file}: shared packages cannot import an application.`)
  if (/packages\/(playback-core|ui-core)\//.test(file) && /(?:node:|next\/(headers|server)|web-core\/server\/)/.test(source)) issues.push(`${file}: browser packages cannot import server modules.`)
  if (source.startsWith("'use client'") || source.startsWith('"use client"')) {
    if (/(?:from\s*|import\s*)['"](?:node:|next\/(headers|server)|@consumit\/web-core\/server\/)/.test(source)) issues.push(`${file}: client modules cannot import server modules.`)
  }
  // Framework entrypoints and export-only adapters deliberately bind each app.
  const basename = path.posix.basename(file)
  if (['page.tsx', 'layout.tsx', 'loading.tsx', 'robots.ts', 'sitemap.ts'].includes(basename)) continue
  if (exceptions[file] || source.split('\n').filter(line => line.trim()).every(line => /^\s*(?:['\"]use client['\"];?|export\s+.+\sfrom\s+['\"].+)\s*$/.test(line))) continue
  const hash = createHash('sha256').update(source).digest('hex')
  groups.set(hash, [...groups.get(hash) ?? [], file])
}
for (const group of groups.values()) if (group.length > 1) issues.push(`Duplicated implementation: ${group.join(', ')}`)
for (const [file, reason] of Object.entries(exceptions)) {
  if (!existsSync(path.join(root, file)) || typeof reason !== 'string' || reason.length < 20) issues.push(`Stale or unexplained duplication exception: ${file}`)
}
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1 }
else console.log(`Shared-code boundaries and duplication checks passed (${files.length} production files).`)
