// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const fx = (f: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', f), 'utf8')
import { kindName, checkKindName, checkRecordValue, recordKind, pickRecords, pageRecords, parseRecord, fetchRecords, addPointer, IDENTITY_KINDS, KNOWN_KINDS } from '../records'

const BEN = '6E0053911942A889426C1866E34D9266098F7FE7'
const ZK = '0zk1' + 'qyqxpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9x8gf2tvdw0s3jn5'   // bech32 charset, real ones are 127 chars

describe('record kinds and encoding', () => {
  it('namespaces bare names and leaves dotted ones alone', () => {
    expect(kindName('canary')).toBe('thurin.canary')
    expect(kindName('thurin.canary')).toBe('thurin.canary')
    expect(kindName('com.example.thing')).toBe('com.example.thing')
    expect(recordKind('thurin.canary')).toMatch(/^0x[0-9a-f]{64}$/)
  })
  it('checks names and values the way the registry does', () => {
    expect(checkKindName('canary')).toBe('thurin.canary')
    expect(checkKindName('com.example.thing')).toBe('com.example.thing')
    expect(() => checkKindName('Bad Kind')).toThrow(/a-z/)
    expect(() => checkKindName('k'.repeat(25))).toThrow(/31/)          // 'thurin.' + 25 = 32
    expect(checkRecordValue('hello')).toBe('hello')
    expect(() => checkRecordValue('x'.repeat(1025))).toThrow(/1024/)
  })
  it('keeps pointer out of the identity page but in the known list', () => {
    expect(IDENTITY_KINDS).not.toContain('thurin.pointer')
    expect(KNOWN_KINDS).toContain('thurin.pointer')
  })
})

describe('parseRecord', () => {
  it('railgun: a 0zk address, or not', async () => {
    const ok = await parseRecord('thurin.railgun', ZK)
    expect(ok.valid).toBe(true)
    expect(ok.data).toMatchObject({ type: 'railgun', address: ZK })
    const bad = await parseRecord('thurin.railgun', '0x539C7e1E454296Dc150B95a0acCC05bCa3b33538')
    expect(bad.valid).toBe(false)
    expect(bad.reason).toMatch(/0zk/)
  })
  it('security: a contact line, url detected', async () => {
    const u = await parseRecord('thurin.security', 'https://thurinlabs.id/security')
    expect(u.data).toMatchObject({ type: 'security', url: 'https://thurinlabs.id/security' })
    const t = await parseRecord('thurin.security', 'encrypt to this key, hello@thurin.id')
    expect(t.valid).toBe(true)
    expect(t.data).toMatchObject({ type: 'security', url: null })
  })
  it('successor: a fingerprint, normalized', async () => {
    const s = await parseRecord('thurin.successor', '6e00 5391 1942 a889 426c 1866 e34d 9266 098f 7fe7')
    expect(s.data).toMatchObject({ type: 'successor', fingerprint: BEN.toLowerCase() })
    expect((await parseRecord('thurin.successor', 'nope')).valid).toBe(false)
  })
  it('affiliation: v1 json with `with`', async () => {
    const a = await parseRecord('thurin.affiliation', '{"v":1,"with":"thurinlabs.eth","role":"founder"}')
    expect(a.data).toMatchObject({ type: 'affiliation', with: 'thurinlabs.eth', role: 'founder' })
    expect((await parseRecord('thurin.affiliation', '{"v":1}')).valid).toBe(false)
    expect((await parseRecord('thurin.affiliation', 'not json')).reason).toBe('Not JSON')
  })
  it('canary: needs a date; reads a clearsigned statement', async () => {
    const plain = await parseRecord('thurin.canary', 'All keys under my control as of 2026-09-23.')
    expect(plain.data).toMatchObject({ type: 'canary', date: '2026-09-23', clearsigned: false })
    const signed = [
      '-----BEGIN PGP SIGNED MESSAGE-----', 'Hash: SHA256', '',
      'Nothing compromised as of 2026-09-01.',
      '-----BEGIN PGP SIGNATURE-----', '', 'abc', '-----END PGP SIGNATURE-----', '',
    ].join('\n')
    const c = await parseRecord('thurin.canary', signed)
    expect(c.data).toMatchObject({ type: 'canary', date: '2026-09-01', clearsigned: true, statement: 'Nothing compromised as of 2026-09-01.' })
    expect((await parseRecord('thurin.canary', 'all good')).valid).toBe(false)
  })
  it('private / disclosure: must be a PGP message', async () => {
    const bad = await parseRecord('thurin.private', 'hello')
    expect(bad.valid).toBe(false)
    expect(bad.reason).toMatch(/PGP message/)
    const garbage = await parseRecord('thurin.disclosure', ['-----BEGIN PGP MESSAGE-----', '', 'notbase64!!', '-----END PGP MESSAGE-----'].join('\n'))
    expect(garbage.valid).toBe(false)
  })
  it('unknown kinds are shown as text', async () => {
    const x = await parseRecord('com.example.thing', 'anything')
    expect(x.valid).toBe(true)
    expect(x.data).toEqual({ type: 'text' })
  })
})

describe('fetchRecords', () => {
  it('reads recordsOf once, keeps identity kinds in display order, skips empty values', async () => {
    const calls: any[] = []
    const client = { readContract: async (a: any) => { calls.push(a); return [['com.example.x', 'thurin.canary', 'thurin.security', 'thurin.railgun'], ['x', 'ok as of 2026-09-23', 'mailto:a@example.com', '']] } }
    const out = await fetchRecords(client as any, '0x4f2d70799cAAD651C7c564426AA74A842c1331B6', [], '0x539C7e1E454296Dc150B95a0acCC05bCa3b33538', 0)
    expect(calls).toHaveLength(1)
    expect(calls[0].functionName).toBe('recordsOf')
    expect(out.map(r => r.kind)).toEqual(['thurin.security', 'thurin.canary'])
  })
  it('pageRecords: Thurin kinds in display order, then the rest in first-set order; pointer and empties left out', () => {
    const names = ['com.b.x', 'thurin.canary', 'thurin.pointer', 'org.a.y', 'thurin.railgun', 'com.c.z']
    const values = ['1', '2', '3', '4', '5', '']
    expect(pageRecords(names, values).map(r => r.kind)).toEqual(['thurin.railgun', 'thurin.canary', 'com.b.x', 'org.a.y'])
  })
  it('pickRecords with null keeps every record in first-set order', () => {
    expect(pickRecords(['b.x', 'thurin.canary'], ['1', '2'], null).map(r => r.kind)).toEqual(['b.x', 'thurin.canary'])
  })
})

describe('pointer (still the CLI release list)', () => {
  it('adds newest first and drops the oldest when full', () => {
    let rec = null as any
    for (let i = 0; i < 40; i++) rec = addPointer(rec, { name: `thurin-cli 0.${i}.0`, sha256: 'a'.repeat(64), date: '2026-09-23', url: 'https://github.com/thurinlabs/thurin-cli/releases/tag/v0' }).record
    expect(rec.releases[0].name).toBe('thurin-cli 0.39.0')
    expect(new TextEncoder().encode(JSON.stringify(rec)).length).toBeLessThanOrEqual(1024)
  })
})

describe('canary verification against the claim key', () => {
  it('verifyClearsigned: the signing key verifies, another key does not', async () => {
    const { verifyClearsigned } = await import('../pgp')
    const signed = fx('company-attestation.asc')   // a real clearsign by the company key
    const ok = await verifyClearsigned({ armoredKey: fx('company-key.asc'), clearsigned: signed })
    expect(ok).toMatchObject({ verified: true })
    expect(ok.text).toMatch(/I control the Ethereum address/)
    const wrong = await verifyClearsigned({ armoredKey: fx('ben-key-newer-selfcert.asc'), clearsigned: signed })
    expect(wrong.verified).toBe(false)
    expect(wrong.reason).toMatch(/not signed by this key/)
  })
  it('parseRecord: a clearsigned canary is checked only when a key is given', async () => {
    const signed = [
      '-----BEGIN PGP SIGNED MESSAGE-----', 'Hash: SHA256', '',
      'All keys under my control as of 2026-09-23.',
      '-----BEGIN PGP SIGNATURE-----', '', 'abc', '-----END PGP SIGNATURE-----', '',
    ].join('\n')
    const unchecked = await parseRecord('thurin.canary', signed)
    expect(unchecked.data).toMatchObject({ type: 'canary', clearsigned: true, verified: null, date: '2026-09-23' })
    const checked = await parseRecord('thurin.canary', signed, { armoredKey: fx('company-key.asc') })
    expect(checked.valid).toBe(true)
    expect(checked.data).toMatchObject({ type: 'canary', clearsigned: true, verified: false })   // garbage signature, honestly reported
  })
})
