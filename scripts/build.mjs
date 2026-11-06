/**
 * Build both halves of the plugin from source into the committed `lib/`.
 *
 * The client half is wrapped in the Harness browser module protocol:
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 * The factory evaluates the ESM source with its imports resolved through the
 * `require` handed in by the module table, and returns the exports object the
 * Loader expects (apply / inject / ...). The host half is a plain ESM module.
 *
 * Keeping `lib/` in Git makes GitHub installs work without running any
 * dependency build scripts (pnpm >=10 blocks those by default).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NAME = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name

/** Strip ESM `export` keywords so the body can live inside a CJS-like factory. */
function toFactoryBody(source) {
  return source
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export class /gm, 'class ')
}

/** Build the wrapped browser bundle. */
function buildClient() {
  const source = readFileSync(join(ROOT, 'src/client/index.js'), 'utf8')
  const body = toFactoryBody(source)
  const exportsList = [...body.matchAll(/^(?:const|function|class) ([A-Za-z_$][\w$]*)/gm)]
    .map(match => match[1])
  const assign = exportsList.map(name => `module.exports.${name} = ${name};`).join('\n')
  const bundle = `// Generated from src/client/index.js by scripts/build.mjs. Do not edit.\n`
    + `window.__ModuleLoader__.load({id:${JSON.stringify(NAME)},factory:(require)=>{\n`
    + `var module={exports:{}};var exports=module.exports;\n`
    + `${body}\n${assign}\nreturn module.exports;\n}});\n`
  mkdirSync(join(ROOT, 'lib'), { recursive: true })
  writeFileSync(join(ROOT, 'lib/client.js'), bundle)
  return bundle
}

/** Build the empty host entry and its declaration. */
function buildHost() {
  const source = readFileSync(join(ROOT, 'src/index.js'), 'utf8')
  writeFileSync(join(ROOT, 'lib/index.js'), source)
  mkdirSync(join(ROOT, 'lib/types'), { recursive: true })
  writeFileSync(join(ROOT, 'lib/types/index.d.ts'), 'export function apply(): void\n')
  mkdirSync(join(ROOT, 'lib/types/client'), { recursive: true })
  writeFileSync(join(ROOT, 'lib/types/client/index.d.ts'),
    'export const inject: string[]\nexport function apply(ctx: unknown): void\nexport const MODULE: string\n')
}

buildHost()
const bundle = buildClient()
console.log(`built lib/index.js, lib/client.js (${bundle.length} bytes), types`)
