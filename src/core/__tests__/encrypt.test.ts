// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as openpgp from 'openpgp'
import { encryptionKeyFor, encryptRefusalText, keyChangedText, encryptTo } from '../encrypt'
import { parsePgpKey } from '../pgp'
import type { Attestation } from '../types'

// Keys are made fresh for each run; nothing private is kept in the repo.
const DAY = 86_400_000
async function makeKey(opts: { curve?: 'curve25519Legacy' | 'secp256k1'; subkeys?: any[]; date?: Date } = {}) {
  return openpgp.generateKey({
    type: 'ecc', curve: opts.curve ?? 'curve25519Legacy', userIDs: [{ name: 'Test' }], format: 'armored',
    subkeys: opts.subkeys, date: opts.date, config: { rejectCurves: new Set() as any },
  })
}
function claim(publicKey: string, { verified = true, createdAt = Math.floor(Date.now() / 1000) - 30 * 86_400, revoked = false } = {}): Attestation {
  return {
    index: 0, fingerprint: '', createdAt, revoked, revokedAt: revoked ? createdAt + 1 : null, state: revoked ? 'revoked' : 'active',
    replacedBy: null, revokeReason: '', messageVersion: 1, pgpSignature: '', pgpPublicKey: publicKey,
    verification: { verified, kind: verified ? 'verified' : 'bad-signature' },
  }
}
async function decrypt(message: string | Uint8Array, privateKey: string) {
  const key = await openpgp.readPrivateKey({ armoredKey: privateKey })
  const msg = typeof message === 'string' ? await openpgp.readMessage({ armoredMessage: message }) : await openpgp.readMessage({ binaryMessage: message })
  const { data } = await openpgp.decrypt({ message: msg, decryptionKeys: key, format: typeof message === 'string' ? 'utf8' : 'binary', config: { rejectCurves: new Set() as any } })
  return data
}

describe('encryptionKeyFor', () => {
  it('picks the encryption subkey of the claim that counts', async () => {
    const k = await makeKey()
    const r = await encryptionKeyFor([claim(k.publicKey)])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const info = await parsePgpKey(k.publicKey)
    expect(r.subkey.fingerprint).toBe(info!.subkeys[0].fingerprint)
    expect(r.subkey.algorithm).toBe('Cv25519')
    expect(r.changedRecently).toBe(false)
  })

  it('parsePgpKey says what each subkey is for', async () => {
    const withEnc = await parsePgpKey((await makeKey()).publicKey)
    expect(withEnc!.canEncrypt).toBe(true)
    expect(withEnc!.subkeys[0]).toMatchObject({ usage: ['encrypt'], valid: true, expires: null })
    const signOnly = await parsePgpKey((await makeKey({ subkeys: [{ sign: true }] })).publicKey)
    expect(signOnly!.canEncrypt).toBe(false)
    expect(signOnly!.subkeys[0].usage).toEqual(['sign'])
  })

  it('refuses when nothing counts, and when the claim does not verify', async () => {
    const k = await makeKey()
    expect(await encryptionKeyFor([])).toMatchObject({ ok: false, reason: 'no-claim' })
    expect(await encryptionKeyFor([claim(k.publicKey, { revoked: true })])).toMatchObject({ ok: false, reason: 'no-claim' })
    expect(await encryptionKeyFor([claim(k.publicKey, { verified: false })])).toMatchObject({ ok: false, reason: 'unverified' })
  })

  it('refuses a key with no encryption subkey', async () => {
    const k = await makeKey({ subkeys: [{ sign: true }] })
    const r = await encryptionKeyFor([claim(k.publicKey)])
    expect(r).toMatchObject({ ok: false, reason: 'no-encryption-subkey' })
    if (!r.ok) expect(encryptRefusalText(r)).toMatch(/no encryption subkey/)
  })

  it('says when the encryption subkey expired', async () => {
    const k = await makeKey({ subkeys: [{ keyExpirationTime: 86_400 }], date: new Date(Date.now() - 10 * DAY) })
    const r = await encryptionKeyFor([claim(k.publicKey)])
    expect(r).toMatchObject({ ok: false, reason: 'encryption-subkey-expired' })
    if (!r.ok) expect(encryptRefusalText(r, () => 'the day')).toBe('Its encryption subkey expired on the day.')
  })

  it('warns when the key arrived in the last 7 days', async () => {
    const k = await makeKey()
    const r = await encryptionKeyFor([claim(k.publicKey, { createdAt: Math.floor(Date.now() / 1000) - 3 * 86_400 })])
    expect(r.ok && r.changedRecently).toBe(true)
    if (r.ok) expect(keyChangedText(r)).toBe('This key was added 3 days ago. If you were expecting a different one, check with them another way.')
  })
})

describe('encryptTo', () => {
  it('round-trips text, with the recipient hidden', async () => {
    const k = await makeKey()
    const armored = await encryptTo(k.publicKey, 'meet at noon') as string
    expect(armored).toMatch(/^-----BEGIN PGP MESSAGE-----/)
    const msg: any = await openpgp.readMessage({ armoredMessage: armored })
    expect(msg.getEncryptionKeyIDs().every((id: any) => id.isWildcard())).toBe(true)
    expect(await decrypt(armored, k.privateKey)).toBe('meet at noon')
  })

  it('names the recipient when asked to', async () => {
    const k = await makeKey()
    const msg: any = await openpgp.readMessage({ armoredMessage: await encryptTo(k.publicKey, 'hi', { hideRecipient: false }) as string })
    expect(msg.getEncryptionKeyIDs().some((id: any) => !id.isWildcard())).toBe(true)
  })

  it('round-trips a file as bytes', async () => {
    const k = await makeKey()
    const file = new Uint8Array([0, 1, 2, 250, 251, 252])
    const out = await encryptTo(k.publicKey, file, { filename: 'notes.bin' })
    expect(out).toBeInstanceOf(Uint8Array)
    expect(Array.from(await decrypt(out, k.privateKey) as Uint8Array)).toEqual(Array.from(file))
  })

  it('encrypts to a secp256k1 key, which openpgp.js refuses by default', async () => {
    const k = await makeKey({ curve: 'secp256k1' })
    expect(await decrypt(await encryptTo(k.publicKey, 'card') as string, k.privateKey)).toBe('card')
  })
})
