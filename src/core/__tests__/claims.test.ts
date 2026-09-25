// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringToHex } from 'viem'
import { readClaims, keyStanding, findOwners } from '../claims'
import type { Attestation } from '../types'

const read = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8')
const OWNER = '0x539C7e1E454296Dc150B95a0acCC05bCa3b33538'
const FP = '08b9374fdfbec67effa24e669d3d86e35361ef7b'
const KEY = stringToHex(read('company-key.asc'))
const SIG = stringToHex(read('company-attestation.asc'))
const BAD_SIG = stringToHex(read('company-attestation.asc').replace('3b33538', '3b33539'))

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  fingerprint: `0x${FP}`, createdAt: 1767225600n, revokedAt: 0n, state: 'active', replacedBy: 0n, revokeReason: '', messageVersion: 0n, ...over,
})

/** A registry stub: `claims` as claimsOf rows, `sigs` per index, and a log of every call. */
function registry(rows: ReturnType<typeof row>[], sigs: (string | Error)[]) {
  const calls: { functionName: string; args: unknown[] }[] = []
  const client = {
    async readContract({ functionName, args }: { functionName: string; args: unknown[] }) {
      calls.push({ functionName, args })
      if (functionName === 'claimsOf') return rows
      const sig = sigs[Number(args[1])]
      if (sig instanceof Error) throw sig
      return functionName === 'keyBytes' ? KEY : sig
    },
  }
  return { client, calls }
}

describe('readClaims', () => {
  it('reads and verifies every claim, oldest first, fingerprints lowercase', async () => {
    const { client } = registry(
      [row({ revokedAt: 1767312000n, state: 'revoked', revokeReason: 'retired' }), row(), row()],
      [SIG, SIG, BAD_SIG],
    )
    const claims = await readClaims(client, OWNER)
    expect(claims.map(c => c.index)).toEqual([0, 1, 2])
    expect(claims.every(c => c.fingerprint === FP)).toBe(true)
    expect(claims[0]).toMatchObject({ revoked: true, revokedAt: 1767312000, state: 'revoked', revokeReason: 'retired' })
    expect(claims[1].verification).toMatchObject({ verified: true, kind: 'verified' })
    expect(claims[2].verification).toMatchObject({ verified: false, kind: 'bad-signature' })
    expect(keyStanding(claims)).toMatchObject({ kind: 'verified', claim: { index: 1 } })
  })

  it('reads only the newest `limit` claims; older ones come back unread', async () => {
    const { client, calls } = registry([row(), row(), row()], [SIG, SIG, SIG])
    const claims = await readClaims(client, OWNER, { limit: 1 })
    expect(calls.filter(c => c.functionName !== 'claimsOf').map(c => Number(c.args[1]))).toEqual([2, 2])
    expect(claims.map(c => c.verification === null)).toEqual([true, true, false])
    expect(claims[0].pgpPublicKey).toBeNull()
  })

  it('a failed key read leaves the claim unverified, not unknown', async () => {
    const { client } = registry([row()], [new Error('execution reverted')])
    const [claim] = await readClaims(client, OWNER)
    expect(claim.verification).toMatchObject({ verified: false })
    expect(claim.pgpSignature).toBeNull()
  })

  it('a failed claimsOf read throws', async () => {
    const client = { readContract: async () => { throw new Error('rpc down') } }
    await expect(readClaims(client, OWNER)).rejects.toThrow('rpc down')
  })
})

describe('keyStanding', () => {
  const claim = (over: Partial<Attestation>): Attestation => ({
    index: 0, fingerprint: FP, createdAt: 0, revoked: false, revokedAt: null, state: 'active', replacedBy: null,
    revokeReason: '', messageVersion: 0, pgpPublicKey: null, pgpSignature: null, verification: { verified: false }, ...over,
  })
  it('none, inactive, not-counted', () => {
    expect(keyStanding([])).toEqual({ kind: 'none', claim: null })
    const ended = claim({ index: 1, revoked: true, state: 'revoked', revokeReason: 'compromised' })
    expect(keyStanding([claim({ revoked: true, state: 'revoked' }), ended])).toEqual({ kind: 'inactive', claim: ended })
    const newest = claim({ index: 1 })
    expect(keyStanding([claim({}), newest])).toEqual({ kind: 'not-counted', claim: newest })
  })
  it('a verified claim wins over a newer one that does not verify', () => {
    const good = claim({ verification: { verified: true } })
    expect(keyStanding([good, claim({ index: 1 })])).toEqual({ kind: 'verified', claim: good })
  })
})

describe('findOwners', () => {
  it('matches a fingerprint whatever its case or spacing', async () => {
    const calls: unknown[][] = []
    const client = { readContract: async ({ args }: { args: unknown[] }) => { calls.push(args); return [OWNER] } }
    expect(await findOwners(client, { fingerprint: '08B9 374F DFBE C67E FFA2  4E66 9D3D 86E3 5361 EF7B' })).toEqual([{ owner: OWNER, fingerprint: FP }])
    expect(calls).toEqual([[`0x${FP}`]])
  })

  it('follows a key ID to every key it matches, each owner once per key', async () => {
    const other = 'aa'.repeat(12) + '9d3d86e35361ef7b'
    const client = {
      readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
        if (functionName === 'fingerprintsForKeyId') return [`0x${FP}`, `0x${other}`]
        return args[0] === `0x${FP}` ? [OWNER, OWNER.toLowerCase()] : [OWNER]
      },
    }
    expect(await findOwners(client, { keyId: '0x9D3D86E35361EF7B' })).toEqual([
      { owner: OWNER, fingerprint: FP },
      { owner: OWNER, fingerprint: other },
    ])
  })

  it('finds nothing for malformed input, without reading', async () => {
    const client = { readContract: async () => { throw new Error('should not read') } }
    expect(await findOwners(client, { fingerprint: 'not-a-fingerprint' })).toEqual([])
    expect(await findOwners(client, { keyId: '123' })).toEqual([])
  })
})
