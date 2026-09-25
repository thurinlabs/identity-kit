// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as openpgp from 'openpgp'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifyAttestation } from '../pgp'
import { claimCheckText, claimFates, claimFateText, expiresSoon, expiresSoonText, formatClaimDate } from '../claimStatus'

// Keys made here, dated in the past, so every way a real claim stops counting can be produced
// without fixtures: expired key, expired signing subkey, revoked (plain / compromised), revoked subkey.
const ADDRESS = '0x1111111111111111111111111111111111111111'
const DAY = 86_400
const daysAgo = (n: number) => new Date(Date.now() - n * DAY * 1000)

async function makeKey(opts: { created: Date; keyExpirationTime?: number; signingSubkey?: { keyExpirationTime?: number } }) {
  const { privateKey } = await openpgp.generateKey({
    type: 'ecc', curve: 'ed25519Legacy', userIDs: [{ name: 'Claim Test' }], date: opts.created,
    keyExpirationTime: opts.keyExpirationTime ?? 0,
    subkeys: opts.signingSubkey ? [{}, { sign: true, keyExpirationTime: opts.signingSubkey.keyExpirationTime ?? 0 }] : [{}],
    format: 'object',
  })
  return privateKey
}

async function clearsign(key: openpgp.PrivateKey, date: Date) {
  const message = await openpgp.createCleartextMessage({ text: `I control the Ethereum address: ${ADDRESS}` })
  return openpgp.sign({ message, signingKeys: key, date }) as Promise<string>
}

const check = (key: openpgp.Key, pgpSignature: string) => verifyAttestation({
  pgpPublicKey: key.toPublic().armor(), pgpSignature, fingerprint: key.getFingerprint(), ethAddress: ADDRESS,
})

describe('verifyAttestation says why a claim does not count', () => {
  it('verified: kind, signing key, and the expiry for "expires soon"', async () => {
    const key = await makeKey({ created: daysAgo(10), keyExpirationTime: 20 * DAY })
    const r = await check(key, await clearsign(key, daysAgo(9)))
    expect(r).toMatchObject({ verified: true, kind: 'verified', signingKey: key.getFingerprint().toUpperCase() })
    const soon = expiresSoon(r)
    expect(soon?.days).toBe(9)
    expect(expiresSoonText(soon!)).toMatch(/^Key expires in 9 days \(\w{3} \d+, \d{4}\)\.$/)
  })

  it('verified with no expiry: nothing to warn about', async () => {
    const key = await makeKey({ created: daysAgo(2) })
    const r = await check(key, await clearsign(key, daysAgo(1)))
    expect(r).toMatchObject({ verified: true, kind: 'verified', expiresAt: null })
    expect(expiresSoon(r)).toBeNull()
  })

  it('expired: the key expiry has passed, with the date', async () => {
    const created = daysAgo(10)
    const key = await makeKey({ created, keyExpirationTime: 2 * DAY })
    const r = await check(key, await clearsign(key, daysAgo(9)))
    expect(r).toMatchObject({ verified: false, kind: 'expired' })
    // PGP stores whole seconds
    expect(Math.abs(new Date(r.at!).getTime() - (created.getTime() + 2 * DAY * 1000))).toBeLessThan(1000)
    expect(claimCheckText(r).label).toBe('key expired')
    expect(claimCheckText(r).fix).toBe('Extend the key, then Update key. No new signature needed.')
  })

  it('signing-key-expired: names the subkey that signed', async () => {
    const key = await makeKey({ created: daysAgo(10), signingSubkey: { keyExpirationTime: 2 * DAY } })
    const r = await check(key, await clearsign(key, daysAgo(9)))
    const signer = key.subkeys[1].getFingerprint().toUpperCase()
    expect(r).toMatchObject({ verified: false, kind: 'signing-key-expired', signingKey: signer })
    expect(claimCheckText(r).sentence).toContain(`(${signer.slice(0, 4)} ${signer.slice(4, 8)} …)`)
  })

  it('revoked: carries the date and the owner\'s reason', async () => {
    const key = await makeKey({ created: daysAgo(10) })
    const sig = await clearsign(key, daysAgo(9))
    const revoked = await openpgp.revokeKey({
      key, reasonForRevocation: { flag: openpgp.enums.reasonForRevocation.keyRetired, string: 'moved to a new key' }, format: 'object',
    }) as unknown as { privateKey: openpgp.PrivateKey }
    const r = await check(revoked.privateKey, sig)
    expect(r).toMatchObject({ verified: false, kind: 'revoked', revocationReason: 'moved to a new key' })
    expect(r.at).toBeTruthy()
    expect(claimCheckText(r).sentence).toMatch(/^Its owner revoked this PGP key on .+ \(reason: moved to a new key\)\. The claim no longer counts\.$/)
  })

  it('compromised: a revocation for compromise is its own kind', async () => {
    const key = await makeKey({ created: daysAgo(10) })
    const sig = await clearsign(key, daysAgo(9))
    const revoked = await openpgp.revokeKey({
      key, reasonForRevocation: { flag: openpgp.enums.reasonForRevocation.keyCompromised }, format: 'object',
    }) as unknown as { privateKey: openpgp.PrivateKey }
    const r = await check(revoked.privateKey, sig)
    expect(r.kind).toBe('compromised')
    expect(claimCheckText(r).label).toBe('key compromised')
    expect(claimCheckText(r).sentence).toContain("Don't trust anything it signed after that date.")
  })

  it('signing-key-revoked: the subkey that signed was revoked, the key was not', async () => {
    const key = await makeKey({ created: daysAgo(10), signingSubkey: {} })
    const sig = await clearsign(key, daysAgo(9))
    key.subkeys[1] = await key.subkeys[1].revoke(key.keyPacket as any, { flag: openpgp.enums.reasonForRevocation.keySuperseded })
    const r = await check(key, sig)
    expect(r).toMatchObject({ verified: false, kind: 'signing-key-revoked', signingKey: key.subkeys[1].getFingerprint().toUpperCase() })
  })

  it('unsupported: a real DSA key (gpg dsa2048, no expiry; public fixture from a throwaway key)', async () => {
    const read = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8')
    const r = await verifyAttestation({
      pgpPublicKey: read('dsa-key.asc'), pgpSignature: read('dsa-attestation.asc'),
      fingerprint: 'BF998827C463D84048E696DE56688CDBEFA7E89A', ethAddress: ADDRESS,
    })
    expect(r).toMatchObject({ verified: false, kind: 'unsupported', algorithm: 'DSA 2048' })
    expect(claimCheckText(r).label).toBe('not supported')
  })

  it('bad-signature: altered statement, wrong fingerprint, missing address', async () => {
    const key = await makeKey({ created: daysAgo(2) })
    const sig = await clearsign(key, daysAgo(1))
    expect((await check(key, sig.replace('11111111111111111111111111111111111111', '11111111111111111111111111111111111112'))).kind).toBe('bad-signature')
    const other = await makeKey({ created: daysAgo(2) })
    expect((await verifyAttestation({ pgpPublicKey: key.toPublic().armor(), pgpSignature: sig, fingerprint: other.getFingerprint(), ethAddress: ADDRESS })).kind).toBe('bad-signature')
    expect((await verifyAttestation({ pgpPublicKey: key.toPublic().armor(), pgpSignature: sig, fingerprint: key.getFingerprint(), ethAddress: '0x2222222222222222222222222222222222222222' })).kind).toBe('bad-signature')
  })
})

describe('claim wording', () => {
  it('has a label and a sentence for every kind', () => {
    for (const kind of ['verified', 'expired', 'signing-key-expired', 'revoked', 'compromised', 'signing-key-revoked', 'unsupported', 'bad-signature'] as const) {
      const t = claimCheckText({ verified: kind === 'verified', kind, at: '2029-03-05T00:00:00.000Z', algorithm: 'DSA 2048' })
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.sentence.endsWith('.')).toBe(true)
    }
    expect(claimCheckText({ verified: false, kind: 'unsupported', algorithm: 'DSA 2048' }).sentence)
      .toBe("This key uses an algorithm Thurin doesn't check (DSA 2048). The claim is on-chain, but no lookup will vouch for it.")
  })

  it('dates read the same in every time zone', () => {
    expect(formatClaimDate('2029-03-05T23:30:00.000Z')).toBe('Mar 5, 2029')
    expect(formatClaimDate(1_790_000_000)).toBe('Sep 21, 2026')
  })

  it('older results without a kind still word sensibly', () => {
    expect(claimCheckText({ verified: true }).kind).toBe('verified')
    expect(claimCheckText({ verified: false, reason: 'x' }).kind).toBe('bad-signature')
  })
})

describe('claimFates: revoked vs replaced', () => {
  it('reads the state, replacement, and reason the registry stores', () => {
    const fates = claimFates([
      { index: 0, revokedAt: 150, state: 'revoked', replacedBy: null, revokeReason: 'compromised' },
      { index: 1, revokedAt: 300, state: 'replaced', replacedBy: 2, revokeReason: 'superseded' },
      { index: 2, revokedAt: null, state: 'active', replacedBy: null, revokeReason: '' },
      { index: 3, revokedAt: 400, state: 'revoked', replacedBy: null, revokeReason: '' },
      { index: 4, revokedAt: 500, state: 'replaced', replacedBy: 5, revokeReason: 'compromised' },
    ])
    expect(claimFateText(fates.get(4)!)).toBe(`Replaced by claim #5 on ${formatClaimDate(500)}. Its key was marked compromised.`)
    expect(fates.get(0)).toEqual({ state: 'revoked', at: 150, reason: 'compromised' })
    expect(fates.get(1)).toEqual({ state: 'replaced', at: 300, by: 2 })
    expect(fates.get(2)).toEqual({ state: 'active' })
    expect(claimFateText(fates.get(1)!)).toBe(`Replaced by claim #2 on ${formatClaimDate(300)}.`)
    expect(claimFateText(fates.get(0)!)).toBe(`Revoked by its owner on ${formatClaimDate(150)} (compromised).`)
    expect(claimFateText(fates.get(3)!)).toBe(`Revoked by its owner on ${formatClaimDate(400)}.`)
    expect(claimFateText(fates.get(2)!)).toBeNull()
  })
})
