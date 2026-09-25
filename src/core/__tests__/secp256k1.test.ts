// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePgpKey, verifyAttestation, verifyClearsigned } from '../pgp'

// A real secp256k1 OpenPGP key made on a JavaCard, and a clearsigned message it signed in
// hardware. openpgp.js rejects this curve unless told otherwise; Thurin must verify it like
// any other key. (The message's wording isn't Thurin's statement, so it is not a valid claim.)
const dir = join(__dirname, 'fixtures')
const key = readFileSync(join(dir, 'secp256k1-key.asc'), 'utf8')
const attestation = readFileSync(join(dir, 'secp256k1-attestation.asc'), 'utf8')
const FPR = '31CE69D66A5E9DE0F977B59C79BB391497E8E6D4'
const ADDR = '0x9ce2e20fc392304fd1e50541ec67168913b5f3ff'

describe('secp256k1 keys', () => {
  it('parses with a verified self-certification and a readable algorithm name', async () => {
    const info = await parsePgpKey(key)
    expect(info).not.toBeNull()
    expect(info!.fingerprint).toBe(FPR)
    expect(info!.userIDs).toEqual(['terricola-testtt'])
    expect(info!.algorithm).toBe('secp256k1')
  })

  it('verifies a hardware-made signature over the curve', async () => {
    const result = await verifyClearsigned({ armoredKey: key, clearsigned: attestation })
    expect(result.verified).toBe(true)
  })

  it('but not as a claim: the signed text is not the statement', async () => {
    const result = await verifyAttestation({ pgpPublicKey: key, pgpSignature: attestation, fingerprint: FPR, ethAddress: ADDR })
    expect(result).toMatchObject({ verified: false, reason: 'Signed text is not the statement for this address' })
  })

  it('still rejects the attestation for a different address', async () => {
    const result = await verifyAttestation({ pgpPublicKey: key, pgpSignature: attestation, fingerprint: FPR, ethAddress: '0xD730182053Bb2365d15B2b1bE68542c760cb7f10' })
    expect(result.verified).toBe(false)
  })
})
