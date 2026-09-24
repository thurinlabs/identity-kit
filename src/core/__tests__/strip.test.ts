// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { stripEmailUserIDs, hasEmailUserID, parsePgpKey, verifyAttestation } from '../pgp'

// Real fixtures generated with GnuPG (no expiry, throwaway keys). MIXED has two
// user IDs — "Alice Example <alice@example.com>" and "thurin" — with a
// proof@thurin.id notation on the thurin user ID only. SIG is a clearsign of the
// Thurin attestation message for ADDR by that key. EMAIL_ONLY has a single
// email user ID.
const FPR = '81E924D80A6209ACDE5CAEE0554BF8A0C7C71AC4'
const ADDR = '0x00000000000000000000000000000000000000a1'
const MIXED = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mDMEaqQAyBYJKwYBBAHaRw8BAQdAMep5SHNBnXtgecsWMq1RUyDGYWTl7yJtLsFg
TvWtqn+0IUFsaWNlIEV4YW1wbGUgPGFsaWNlQGV4YW1wbGUuY29tPoiQBBMWCgA4
FiEEgekk2ApiCazeXK7gVUv4oMfHGsQFAmqkAMgCGwMFCwkIBwIGFQoJCAsCBBYC
AwECHgECF4AACgkQVUv4oMfHGsRBRwEA0XHzYfLODJppop0kHOvGoz/jmJo3y9WU
FxfkCvTtXEwA/jfFFQXXaGfaKLKOdSYjFs3A7NHOGyOUiwEsjzOzHtIMtAZ0aHVy
aW6IwQQTFgoAaQIbAwULCQgHAgYVCgkICwIEFgIDAQIeAQIXgBYhBIHpJNgKYgms
3lyu4FVL+KDHxxrEBQJqpADJMBSAAAAAAA8AGHByb29mQHRodXJpbi5pZGRuczpl
eGFtcGxlLmNvbT90eXBlPVRYVAAKCRBVS/igx8caxKT8AQCGhC7U4e9rrtRkwbaJ
eUXymXISY/7HXlDIflf9ftA7JQD7BmHIEaf/wSYCLSf9yAtK21+G1nVM+2sulW5x
9k6V5A8=
=NHYM
-----END PGP PUBLIC KEY BLOCK-----`
const SIG = `-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

I control the Ethereum address: 0x00000000000000000000000000000000000000a1

-----BEGIN PGP SIGNATURE-----

iHQEARYKAB0WIQSB6STYCmIJrN5cruBVS/igx8caxAUCaqQAyQAKCRBVS/igx8ca
xEXgAPjIcrqaGRFkk/WAbly3xhlJCoAzcHbnBEFaadP7bltjAP0Svih3lGzoateM
ITkDJqk01bFxJlcEPtZrs6d0lNIhAQ==
=uklU
-----END PGP SIGNATURE-----`
const EMAIL_ONLY = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mDMEaqQAyRYJKwYBBAHaRw8BAQdAdiObzRpkYuNK6VVSiUSqqActZBtSNVrFgqdj
Ov/sUCu0HUJvYiBFeGFtcGxlIDxib2JAZXhhbXBsZS5jb20+iJAEExYKADgWIQSj
0PUOP0y7M/6iX9ShgRLUAg2P0gUCaqQAyQIbAwULCQgHAgYVCgkICwIEFgIDAQIe
AQIXgAAKCRChgRLUAg2P0uTXAP96wEDIX1SLeNNKfaRtUyUOGwIKXQ5zGE8uXWVb
Ct5BSgEA5zXAFGZ9eN6mjswDgonCtlcggdhoZWOoYuJYDPZ1Ago=
=2/Rh
-----END PGP PUBLIC KEY BLOCK-----`

describe('stripEmailUserIDs (real keys)', () => {
  it('keeps non-email user IDs and drops email ones', async () => {
    const r = await stripEmailUserIDs(MIXED)
    expect(r).not.toBeNull()
    expect(r!.kept).toEqual(['thurin'])
    expect(r!.removed).toEqual(['Alice Example <alice@example.com>'])
    expect(r!.armored).toContain('BEGIN PGP PUBLIC KEY BLOCK')
    expect(r!.armored).not.toContain('alice@example.com')
  })

  it('returns null when only email user IDs exist', async () => {
    expect(await stripEmailUserIDs(EMAIL_ONLY)).toBeNull()
  })

  it('returns null for garbage input', async () => {
    expect(await stripEmailUserIDs('not a key')).toBeNull()
  })

  it('the stripped key still verifies the attestation signature', async () => {
    const r = await stripEmailUserIDs(MIXED)
    const v = await verifyAttestation({ pgpPublicKey: r!.armored, pgpSignature: SIG, fingerprint: FPR, ethAddress: ADDR })
    expect(v).toMatchObject({ verified: true, kind: 'verified' })
  })

  it('the stripped key keeps the proof notations on the published user ID', async () => {
    const r = await stripEmailUserIDs(MIXED)
    const info = await parsePgpKey(r!.armored)
    expect(info!.fingerprint).toBe(FPR)
    expect(info!.userIDs).toEqual(['thurin'])
    expect(info!.notations).toContainEqual({ name: 'proof@thurin.id', value: 'dns:example.com?type=TXT' })
  })
})

describe('hasEmailUserID (real keys)', () => {
  it('detects an email user ID', async () => {
    expect(await hasEmailUserID(MIXED)).toBe(true)
    expect(await hasEmailUserID(EMAIL_ONLY)).toBe(true)
  })
  it('is false once stripped, and false for garbage', async () => {
    const r = await stripEmailUserIDs(MIXED)
    expect(await hasEmailUserID(r!.armored)).toBe(false)
    expect(await hasEmailUserID('nope')).toBe(false)
  })
})
