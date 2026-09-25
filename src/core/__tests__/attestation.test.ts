// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifyAttestation } from '../pgp'

// Real keys and clearsigned statements as stored on the mainnet PGPRegistry.
const dir = join(__dirname, 'fixtures')
const read = (f: string) => readFileSync(join(dir, f), 'utf8')

describe('verifyAttestation against real on-chain data', () => {
  it('verifies a key whose only self-certification is NEWER than the attest signature', async () => {
    // bendoubleu.eth, 2026-09-14: statement signed 13:55 UTC, notations edited 14:11 UTC,
    // then `export-minimal` kept only the 14:11 self-certification. gpg: good signature.
    // openpgp.verify() rejects it ("Could not find valid self-signature") because it
    // judges validity at signing time. Thurin must accept it.
    const result = await verifyAttestation({
      pgpPublicKey: read('ben-key-newer-selfcert.asc'),
      pgpSignature: read('ben-attestation.asc'),
      fingerprint: '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8',
      ethAddress: '0xD730182053Bb2365d15B2b1bE68542c760cb7f10',
    })
    expect(result).toMatchObject({ verified: true, kind: 'verified' })
  })

  it('verifies a statement signed by a signing SUBKEY of a certify-only primary', async () => {
    // thurinlabs.eth's company key: [C] primary, [S] subkey signs.
    const result = await verifyAttestation({
      pgpPublicKey: read('company-key.asc'),
      pgpSignature: read('company-attestation.asc'),
      fingerprint: '08B9374FDFBEC67EFFA24E669D3D86E35361EF7B',
      ethAddress: '0x539c7e1e454296dc150b95a0accc05bca3b33538',
    })
    expect(result).toMatchObject({ verified: true, kind: 'verified' })
  })

  it('rejects a statement whose text was altered after signing', async () => {
    const tampered = read('ben-attestation.asc').replace('cb7f10', 'cb7f11')
    const result = await verifyAttestation({
      pgpPublicKey: read('ben-key-newer-selfcert.asc'),
      pgpSignature: tampered,
      fingerprint: '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8',
      ethAddress: '0xD730182053Bb2365d15B2b1bE68542c760cb7f11',
    })
    expect(result.verified).toBe(false)
  })

  it('rejects a statement signed by a different key than the one supplied', async () => {
    const result = await verifyAttestation({
      pgpPublicKey: read('company-key.asc'),
      pgpSignature: read('ben-attestation.asc'),
      fingerprint: '08B9374FDFBEC67EFFA24E669D3D86E35361EF7B',
      ethAddress: '0xD730182053Bb2365d15B2b1bE68542c760cb7f10',
    })
    expect(result.verified).toBe(false)
  })

  it('rejects a valid signature over a statement naming a different address', async () => {
    const result = await verifyAttestation({
      pgpPublicKey: read('ben-key-newer-selfcert.asc'),
      pgpSignature: read('ben-attestation.asc'),
      fingerprint: '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8',
      ethAddress: '0x539c7e1e454296dc150b95a0accc05bca3b33538',
    })
    expect(result).toMatchObject({ verified: false, reason: 'Signed text is not the statement for this address', kind: 'bad-signature' })
  })
})
