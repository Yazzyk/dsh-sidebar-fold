/**
 * Verify the committed distribution: exports resolve, the client bundle uses
 * the Harness module protocol, and its factory exposes the plugin contract.
 * Runs in plain Node with no dependencies.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
let failures = 0
const check = (ok, label) => {
  if (!ok) { failures++; console.error('FAIL:', label) }
  else console.log('ok:', label)
}

check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch points at the patch layer')
check(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform is web')
check(pkg.name.startsWith('dsh-'), 'package name is a dsh plugin name')
for (const path of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
  check(existsSync(join(ROOT, path)), `distribution file exists: ${path}`)
}
for (const [subpath, target] of Object.entries({
  '.': pkg.exports['.'].default,
  './client': pkg.exports['./client'].default,
  './cordis.patch.yml': pkg.exports['./cordis.patch.yml'],
})) {
  check(existsSync(join(ROOT, target)), `exports ${subpath} -> ${target}`)
}

const client = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
check(client.includes('window.__ModuleLoader__.load('), 'client bundle uses the module loader')
check(client.includes(`id:${JSON.stringify(pkg.name)}`) || client.includes(`id: "${pkg.name}"`), 'module id is the package name')
check(client.includes('return module.exports'), 'factory returns its exports')

// Execute the whole bundle the way the browser module table does, then call
// the registered factory with a stub `require` to prove the plugin contract.
let entry
const fakeWindow = { __ModuleLoader__: { load: (e) => { entry = e } } }
new Function('window', client)(fakeWindow)
check(entry !== undefined && typeof entry.factory === 'function', 'bundle registers a loadable factory')
if (entry !== undefined && typeof entry.factory === 'function') {
  const exported = entry.factory(() => ({}))
  check(typeof exported.apply === 'function', 'factory exports apply()')
  check(Array.isArray(exported.inject), 'factory exports inject[]')
  check(exported.MODULE === pkg.name, 'factory module id matches the package name')
}

const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
check(/^\s*-\s*insert:/m.test(patch), 'patch is a top-level insert array')
check(patch.includes(`name: ${pkg.name}`), 'patch row names this package')

if (failures > 0) {
  console.error(`\n${failures} verification failure(s).`)
  process.exit(1)
}
console.log('\nverify: all checks passed.')
