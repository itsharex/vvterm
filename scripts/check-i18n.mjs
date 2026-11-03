#!/usr/bin/env node
// The interface is translated by looking up its English text (frontend/src/lib/i18n). This checks that
//  - every text passed to t() / tn() in the code is in the catalogues of vi, ja and zh (a missing one would show English),
//  - a catalogue has no entry that the code no longer uses, and no empty translation,
//  - a translation has the same {variables} as its English text,
//  - a text is written out, with {name} variables (a template string with ${} cannot be looked up, so it is refused).
// Usage: node scripts/check-i18n.mjs        (also run by `make test`)
import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src')
const LANGS = ['vi', 'ja', 'zh']

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !p.includes('/lib/i18n/')) out.push(p)
  }
  return out
}

const STR = String.raw`(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|` + '`((?:\\\\.|[^`\\\\$])*)`)'
const unq = m => (m[1] ?? m[2] ?? m[3]).replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n')
const reT = new RegExp(String.raw`(?<![\w.$])tt?\(\s*` + STR, 'g') // tt: the module level t imported under another name where a component has its own t

const used = new Map() // text -> first place
const problems = []
for (const file of walk(root)) {
  const src = readFileSync(file, 'utf8')
  const rel = file.slice(root.length - 3)
  const lineOf = i => src.slice(0, i).split('\n').length
  for (const m of src.matchAll(reT)) used.has(unq(m)) || used.set(unq(m), `${rel}:${lineOf(m.index)}`)
  for (const m of src.matchAll(/(?<![\w.$])tnn?\(\s*[^,]+,\s*(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\$])*)`)\s*,\s*(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\$])*)`)/g)) {
    const un = x => x.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n')
    for (const k of [un(m[1] ?? m[2] ?? m[3]), un(m[4] ?? m[5] ?? m[6])]) used.has(k) || used.set(k, `${rel}:${lineOf(m.index)}`)
  }
  for (const m of src.matchAll(/(?<![\w.$])t\(\s*`[^`]*\$\{/g)) problems.push(`${rel}:${lineOf(m.index)}: t(\`...\${}\`): use {name} variables`)
}

const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',')
const require = createRequire(import.meta.url)
async function catalogue(lang) {
  const dir = join(root, 'lib', 'i18n', 'locales', lang)
  const cat = {}
  for (const f of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const code = readFileSync(join(dir, f), 'utf8').replace(/^export default\s*/m, 'module.exports = ').replace(/^import .*$/gm, '').replace(/\}\s*as\s+Record<string,\s*string>\s*;?\s*$/, '}')
    const m = {exports: {}}
    new Function('module', 'exports', 'require', code)(m, m.exports, require)
    for (const [k, v] of Object.entries(m.exports)) {
      if (k in cat && cat[k] !== v) problems.push(`${lang}: "${k.slice(0, 60)}" has two different translations (second one in ${f})`)
      cat[k] = v
    }
  }
  return cat
}

for (const lang of LANGS) {
  const cat = await catalogue(lang)
  for (const [k, where] of used) {
    if (!(k in cat)) problems.push(`${lang}: missing "${k.slice(0, 80)}" (${where})`)
  }
  for (const [k, v] of Object.entries(cat)) {
    if (!used.has(k)) problems.push(`${lang}: unused entry "${k.slice(0, 80)}"`)
    else if (typeof v !== 'string' || v.trim() === '') problems.push(`${lang}: empty translation of "${k.slice(0, 80)}"`)
    else if (vars(k) !== vars(v)) problems.push(`${lang}: variables of "${k.slice(0, 60)}" differ from its translation "${v.slice(0, 60)}"`)
  }
}
if (problems.length) {
  console.error(problems.slice(0, 60).join('\n') + (problems.length > 60 ? `\n… and ${problems.length - 60} more` : ''))
  process.exit(1)
}
console.log(`i18n: ${used.size} texts, ${LANGS.length} languages: all present`)
