// Writes dist/thurin-check.LICENSES.txt: the license of every package in dist/thurin-check.min.js,
// read from esbuild's metafile (every file the bundle holds), which it then deletes.
import { readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'

const META = 'dist/metafile-iife.json'
const inputs = Object.keys(JSON.parse(readFileSync(META, 'utf8')).inputs)
rmSync(META)

// node_modules/a/node_modules/@b/c/x.js → node_modules/a/node_modules/@b/c: one entry per installed copy.
const dirs = new Set()
for (const path of inputs) {
  const m = path.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)
  if (m) dirs.add(m[1])
}

const licenseText = dir => {
  const file = readdirSync(dir).find(f => /^(licen[cs]e|copying)(\.|$)/i.test(f))
  if (file) return readFileSync(`${dir}/${file}`, 'utf8').trim()
  const meta = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'))
  const author = typeof meta.author === 'string' ? meta.author : meta.author?.name
  return `${meta.license} license${author ? `, copyright ${author}` : ''} (no license file shipped; see the package).`
}

const kit = JSON.parse(readFileSync('package.json', 'utf8'))
const packages = [...dirs].map(dir => ({ dir, ...JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
const rule = '='.repeat(78)
const section = (title, body) => `\n${rule}\n${title}\n${rule}\n\n${body}\n`

let out = `Software in thurin-check.min.js, from ${kit.name} ${kit.version}.\n`
out += `The file is minified. Its source: ${kit.name}@${kit.version} (src/browser.ts) and each package below,\n`
out += `at the npm registry under its name and version. Rebuild it with \`npm run build\` in the kit.\n`
out += section(`${kit.name}@${kit.version}  (${kit.license})`, licenseText('.'))
for (const p of packages) out += section(`${p.name}@${p.version}  (${p.license ?? 'see below'})`, licenseText(p.dir))
// LGPL-3.0 (openpgp) is a set of permissions on top of the GPL-3.0, which must travel with it.
if (packages.some(p => /GPL/.test(p.license ?? ''))) {
  out += section('GNU General Public License, version 3 (referenced by the LGPL-3.0 above)', readFileSync('licenses/GPL-3.0.txt', 'utf8').trim())
}
writeFileSync('dist/thurin-check.LICENSES.txt', out)
console.log(`dist/thurin-check.LICENSES.txt: ${packages.length} packages`)
