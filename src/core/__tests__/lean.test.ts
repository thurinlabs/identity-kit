// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as openpgp from 'openpgp'
import { leanKey, claimSignature, verifyAttestation, parsePgpKey, statementText, payloadText, signatureEmail } from '../pgp'

// Fixtures made with gpg from a throwaway key (public data only): an email name, a plain name, a
// revoked name, and signing / encryption / authentication subkeys. `lean-gpg-key.gpg` is gpg's own
// lean export (export-minimal, keep-uid 'uid !~ @', drop-subkey 'usage = a'); `lean-detached.sig`
// is `printf '%s' <statement> | gpg --detach-sign --textmode`; `lean-echo-clearsign.asc` is
// `echo <statement> | gpg --clearsign` (signs a trailing line break).
const dir = join(__dirname, 'fixtures')
const text = (f: string) => readFileSync(join(dir, f), 'utf8')
const bytes = (f: string) => new Uint8Array(readFileSync(join(dir, f)))
const hex = (b: Uint8Array) => '0x' + Buffer.from(b).toString('hex')
const FPR = text('lean-fingerprint.txt').trim()
const ADDRESS = '0x1111111111111111111111111111111111111111'

describe('leanKey', () => {
  it('keeps the fingerprint, the plain name, signing + encryption subkeys, and the revocation; drops the email name and the auth subkey', async () => {
    const lean = await leanKey(text('lean-full-key.asc'))
    expect(lean).not.toBeNull()
    expect(lean!.removed).toEqual(['Lean Test <lean@example.com>'])
    expect(lean!.kept).toContain('Lean Test')
    expect(lean!.droppedSubkeys).toHaveLength(1)

    const key: any = await openpgp.readKey({ binaryKey: lean!.binary })
    expect(key.getFingerprint().toUpperCase()).toBe(FPR)
    expect(key.subkeys).toHaveLength(2)
    const old = key.users.find((u: any) => u.userID?.userID === 'Old Name')
    expect(old?.revocationSignatures?.length).toBeGreaterThan(0)
    expect(key.users.some((u: any) => /@/.test(u.userID?.userID ?? ''))).toBe(false)
  })

  it('is about the size of gpg\'s own lean export, and far smaller than the armored key', async () => {
    const lean = await leanKey(text('lean-full-key.asc'))
    const gpgLean = bytes('lean-gpg-key.gpg')
    expect(Math.abs(lean!.binary.length - gpgLean.length)).toBeLessThan(16)
    expect(lean!.binary.length).toBeLessThan(text('lean-full-key.asc').length * 0.5)
  })

  it('keeps the email name when asked', async () => {
    const lean = await leanKey(text('lean-full-key.asc'), { includeEmail: true })
    expect(lean!.removed).toEqual([])
    expect(lean!.kept).toContain('Lean Test <lean@example.com>')
  })

  it('reads its own output back (binary in, same bytes out)', async () => {
    const once = await leanKey(text('lean-full-key.asc'))
    const twice = await leanKey(once!.binary)
    expect(hex(twice!.binary)).toBe(hex(once!.binary))
  })
})

describe('the lean format verifies (gpg interop)', () => {
  it('gpg lean key + gpg detached text-mode signature → verified', async () => {
    const r = await verifyAttestation({ pgpPublicKey: bytes('lean-gpg-key.gpg'), pgpSignature: bytes('lean-detached.sig'), fingerprint: FPR, ethAddress: ADDRESS })
    expect(r).toMatchObject({ verified: true, kind: 'verified' })
  })

  it('accepts the 0x hex a contract call returns', async () => {
    const r = await verifyAttestation({ pgpPublicKey: hex(bytes('lean-gpg-key.gpg')), pgpSignature: hex(bytes('lean-detached.sig')), fingerprint: FPR, ethAddress: ADDRESS })
    expect(r.verified).toBe(true)
  })

  it('our lean key verifies the same signature', async () => {
    const lean = await leanKey(text('lean-full-key.asc'))
    const r = await verifyAttestation({ pgpPublicKey: lean!.binary, pgpSignature: bytes('lean-detached.sig'), fingerprint: FPR, ethAddress: ADDRESS })
    expect(r.verified).toBe(true)
  })

  it('a clearsign made with echo verifies whole, but not reduced to its signature (it signs a trailing line break)', async () => {
    const lean = await leanKey(text('lean-full-key.asc'))
    const whole = await verifyAttestation({ pgpPublicKey: lean!.binary, pgpSignature: text('lean-echo-clearsign.asc'), fingerprint: FPR, ethAddress: ADDRESS })
    expect(whole.verified).toBe(true)
    const sig = (await openpgp.readCleartextMessage({ cleartextMessage: text('lean-echo-clearsign.asc') })).signature.write()
    const reduced = await verifyAttestation({ pgpPublicKey: lean!.binary, pgpSignature: sig, fingerprint: FPR, ethAddress: ADDRESS })
    expect(reduced.verified).toBe(false)
  })

  it('claimSignature keeps an echo clearsign whole (version 0) and stores a detached signature as its packet (version 1)', async () => {
    const key = bytes('lean-gpg-key.gpg')
    const echo = await claimSignature({ signature: text('lean-echo-clearsign.asc'), key, address: ADDRESS })
    expect(echo!.messageVersion).toBe(0)
    expect(echo!.signature).toBe(text('lean-echo-clearsign.asc'))
    const armored = openpgp.armor(openpgp.enums.armor.signature, bytes('lean-detached.sig'))
    const detached = await claimSignature({ signature: armored, key, address: ADDRESS })
    expect(detached!.messageVersion).toBe(1)
    expect(detached!.signature).toEqual(bytes('lean-detached.sig'))   // gpg's exact bytes, old-style header kept
    const r = await verifyAttestation({ pgpPublicKey: key, pgpSignature: detached!.signature, fingerprint: FPR, ethAddress: ADDRESS })
    expect(r.verified).toBe(true)
  })

  it('the wrong address does not verify', async () => {
    const r = await verifyAttestation({ pgpPublicKey: bytes('lean-gpg-key.gpg'), pgpSignature: bytes('lean-detached.sig'), fingerprint: FPR, ethAddress: '0x2222222222222222222222222222222222222222' })
    expect(r).toMatchObject({ verified: false, kind: 'bad-signature' })
  })

  it('parsePgpKey reads the binary key', async () => {
    const info = await parsePgpKey(bytes('lean-gpg-key.gpg'))
    expect(info?.fingerprint).toBe(FPR)
    expect(info?.userIDs).toContain('Lean Test')
  })

  it('statementText is the line every claim signs', () => {
    expect(statementText('0xABCdef0000000000000000000000000000000001')).toBe('I control the Ethereum address: 0xabcdef0000000000000000000000000000000001')
  })

  it('payloadText turns stored lean bytes back into armored text gpg reads, and leaves text alone', async () => {
    const key = await payloadText(hex(bytes('lean-gpg-key.gpg')), 'key')
    expect(key).toMatch(/^-----BEGIN PGP PUBLIC KEY BLOCK-----/)
    const sig = await payloadText(hex(bytes('lean-detached.sig')), 'signature')
    expect(sig).toMatch(/^-----BEGIN PGP SIGNATURE-----/)
    const r = await verifyAttestation({ pgpPublicKey: key!, pgpSignature: sig!, fingerprint: FPR, ethAddress: ADDRESS })
    expect(r.verified).toBe(true)
    const clear = text('lean-echo-clearsign.asc')
    expect(await payloadText('0x' + Buffer.from(clear).toString('hex'), 'signature')).toBe(clear)
  })
})

describe('signatureEmail: an email gpg wrote into the signature', () => {
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
  it('finds it when gpg was told the key by email, detached or clearsigned', async () => {
    expect(await signatureEmail(fixture('signer-uid.asc'))).toBe('fixture@example.com')
    expect(await signatureEmail(fixture('signer-uid-clearsigned.asc'))).toBe('fixture@example.com')
  })
  it('finds nothing with --disable-signer-uid, or on something that is not a signature', async () => {
    expect(await signatureEmail(fixture('signer-uid-disabled.asc'))).toBeNull()
    expect(await signatureEmail('not a signature')).toBeNull()
  })
})

describe('leanKey: emails in notations', () => {
  const key = readFileSync(new URL('./fixtures/notation-email-key.asc', import.meta.url), 'utf8')
  it('leaves out a name whose notation holds an email, and keeps a Mastodon proof', async () => {
    const lean = (await leanKey(key))!
    expect(lean.kept).toEqual(['Plain Name'])
    expect(lean.removed).toEqual(['Other Name'])
    expect(new TextDecoder().decode(lean.binary)).not.toContain('hidden@example.com')
    expect((await parsePgpKey(lean.binary))!.notations.map(n => n.value)).toEqual(['https://mastodon.social/@probe'])
  })
  it('keeps it all with includeEmail', async () => {
    expect((await leanKey(key, { includeEmail: true }))!.kept.sort()).toEqual(['Other Name', 'Plain Name'])
  })
})
