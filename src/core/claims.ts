import { REGISTRY_ABI, REGISTRY_ADDRESS } from './contract'
import { bytesToFingerprint, fingerprintToBytes, keyIdToBytes, normalizeFingerprint } from './fingerprint'
import { payloadText, verifyAttestation } from './pgp'
import type { Attestation } from './types'

/** Any client with viem's `readContract` (a viem PublicClient, or a stub in tests). */
export interface ClaimReader {
  readContract(args: any): Promise<unknown>
}

type Address = `0x${string}`

interface ClaimRow {
  fingerprint: `0x${string}`
  createdAt: bigint | number
  revokedAt: bigint | number
  state: Attestation['state']
  replacedBy: bigint | number
  revokeReason: string
  messageVersion: bigint | number
}

/** How many of the newest claims `readClaims` reads and verifies by default. */
export const CLAIM_LIMIT = 50

/**
 * An address's claims, oldest first: every row from `claimsOf`, and for the newest `limit` the
 * stored key and signature, verified. Older claims come back with `verification: null` (not read):
 * an address can hold 65,535 claims, and each one checked costs two reads and a signature check.
 * A failed `claimsOf` read throws; a failed key or signature read leaves that claim unverified.
 */
export async function readClaims(
  client: ClaimReader, owner: Address,
  { registry = REGISTRY_ADDRESS, limit = CLAIM_LIMIT }: { registry?: Address; limit?: number } = {},
): Promise<Attestation[]> {
  const read = (functionName: string, args: unknown[]) => client.readContract({ address: registry, abi: REGISTRY_ABI, functionName, args })
  const rows = await read('claimsOf', [owner]) as readonly ClaimRow[]
  const first = Math.max(0, rows.length - limit)

  return Promise.all(rows.map(async (row, index): Promise<Attestation> => {
    const revokedAt = Number(row.revokedAt)
    const claim: Attestation = {
      index,
      fingerprint: bytesToFingerprint(row.fingerprint),
      createdAt: Number(row.createdAt),
      revoked: revokedAt !== 0,
      revokedAt: revokedAt || null,
      state: row.state,
      replacedBy: row.state === 'replaced' ? Number(row.replacedBy) : null,
      revokeReason: row.revokeReason,
      messageVersion: Number(row.messageVersion),
      pgpPublicKey: null,
      pgpSignature: null,
      verification: null,
    }
    if (index < first) return claim
    const bytes = (fn: string) => read(fn, [owner, BigInt(index)]).catch(() => null) as Promise<`0x${string}` | null>
    const [keyHex, sigHex] = await Promise.all([bytes('keyBytes'), bytes('signatureBytes')])
    claim.pgpPublicKey = keyHex ? await payloadText(keyHex, 'key') : null
    claim.pgpSignature = sigHex ? await payloadText(sigHex, 'signature') : null
    claim.verification = await verifyAttestation({
      pgpPublicKey: claim.pgpPublicKey, pgpSignature: claim.pgpSignature, fingerprint: claim.fingerprint, ethAddress: owner,
    })
    return claim
  }))
}

/** Where an address's key stands. verified: the newest active claim that verifies · not-counted: the
 *  newest active claim, none verify (its `verification` says why) · inactive: only ended claims, the
 *  newest · none: never claimed. */
export type KeyStanding =
  | { kind: 'verified' | 'not-counted' | 'inactive'; claim: Attestation }
  | { kind: 'none'; claim: null }

export function keyStanding(claims: readonly Attestation[]): KeyStanding {
  const active = claims.filter(c => !c.revoked)
  const verified = active.filter(c => c.verification?.verified)
  if (verified.length) return { kind: 'verified', claim: verified[verified.length - 1] }
  if (active.length) return { kind: 'not-counted', claim: active[active.length - 1] }
  if (claims.length) return { kind: 'inactive', claim: claims[claims.length - 1] }
  return { kind: 'none', claim: null }
}

/**
 * Every address that ever claimed a key, found by fingerprint (`ownersOf`) or long key ID
 * (`fingerprintsForKeyId`, then `ownersOf`). A key ID can match more than one key, so each owner
 * comes with the fingerprint it claimed. Malformed input finds nothing.
 */
export async function findOwners(
  client: ClaimReader, key: { fingerprint: string } | { keyId: string },
  { registry = REGISTRY_ADDRESS }: { registry?: Address } = {},
): Promise<{ owner: Address; fingerprint: string }[]> {
  const read = (functionName: string, args: unknown[]) => client.readContract({ address: registry, abi: REGISTRY_ABI, functionName, args })
  let fingerprints: string[]
  if ('keyId' in key) {
    const keyId = keyIdToBytes(key.keyId)
    if (!keyId) return []
    fingerprints = (await read('fingerprintsForKeyId', [keyId]) as readonly string[]).map(bytesToFingerprint)
  } else {
    const fp = normalizeFingerprint(key.fingerprint)
    if (!fp) return []
    fingerprints = [fp]
  }
  const found: { owner: Address; fingerprint: string }[] = []
  for (const fingerprint of fingerprints) {
    for (const owner of await read('ownersOf', [fingerprintToBytes(fingerprint)]) as readonly Address[]) {
      if (!found.some(f => f.owner.toLowerCase() === owner.toLowerCase() && f.fingerprint === fingerprint)) found.push({ owner, fingerprint })
    }
  }
  return found
}
