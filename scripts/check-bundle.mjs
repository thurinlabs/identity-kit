// Loads dist/thurin-check.js as a page's <script> would (as an ES module there is no require or
// module in scope) and checks two answers that need no network. Run after `npm run build`.
// (A separate vm context fails on its own: openpgp's instanceof checks see two realms' Uint8Arrays.)
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
globalThis.fetch = () => { throw new Error('the bundle asked the network') }
vm.runInThisContext(read('../dist/thurin-check.js'))
const { ThurinCheck } = globalThis
if (typeof ThurinCheck?.checkKeyFor !== 'function') throw new Error('ThurinCheck.checkKeyFor is missing')

const junk = await ThurinCheck.checkKeyFor({ key: 'not a key', owner: 'thurinlabs.eth' })
if (junk.status !== 'mismatch') throw new Error(`expected mismatch for "not a key", got ${junk.status}`)

// A real key with an owner that isn't a name: openpgp inside the bundle reads it, and the check stops before the node.
const real = await ThurinCheck.checkKeyFor({ key: read('../src/core/__tests__/fixtures/company-key.asc'), owner: 'not a name!' })
if (real.status !== 'unverified' || real.fingerprint !== '08B9374FDFBEC67EFFA24E669D3D86E35361EF7B') {
  throw new Error(`the bundle didn't read a real key: ${JSON.stringify(real)}`)
}
console.log('thurin-check.js: loads, reads keys, ThurinCheck.checkKeyFor answers')
