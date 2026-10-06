// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as openpgp from 'openpgp'
import { parsePgpKey } from '../pgp'

describe('notations', () => {
  it('leaves out binary notations (openpgp.js salts its signatures with one)', async () => {
    const { publicKey } = await openpgp.generateKey({ type: 'ecc', curve: 'ed25519Legacy', userIDs: [{ name: 'Salted' }], format: 'object' })
    const raw = publicKey.users[0].selfCertifications[0].rawNotations
    expect(raw.some(n => n.name === 'salt@notations.openpgpjs.org' && n.humanReadable === false)).toBe(true)   // the case this guards
    const info = await parsePgpKey(publicKey.armor())
    expect(info?.notations.map(n => n.name)).not.toContain('salt@notations.openpgpjs.org')
  })
})
