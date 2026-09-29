import { isAddress } from 'viem'
import { normalize } from 'viem/ens'
import { readClaims, keyStanding, type ClaimReader } from './claims'
import { CLAIM_CHECK_LABEL, formatClaimDate } from './claimStatus'
import { parsePgpKey, type PgpInput } from './pgp'
import type { Attestation } from './types'

type Address = `0x${string}`

/** A claim reader that can also resolve ENS names (a viem PublicClient). */
export interface KeyCheckReader extends ClaimReader {
  getEnsAddress?(args: { name: string }): Promise<Address | null>
}

/**
 * verified: the key matches an active, verified claim by the owner · mismatch: don't encrypt to it
 * (the owner's verified key is another one, the owner revoked this one, or it isn't a key) ·
 * unverified: nothing verified to compare with · unreachable: the node couldn't be asked.
 */
export type KeyCheckStatus = 'verified' | 'mismatch' | 'unverified' | 'unreachable'

export interface KeyCheck {
  status: KeyCheckStatus
  /** One plain sentence saying why. */
  reason: string
  /** The checked key's fingerprint, uppercase; null when it isn't a readable key. */
  fingerprint: string | null
  /** The owner's key on Ethereum, uppercase: the matching claim's, or the verified one it differs from. */
  claimedFingerprint: string | null
  /** The owner's address, once known. */
  address: Address | null
  /** The claim the answer rests on. */
  claim: Attestation | null
}

/**
 * Is this key good for this owner? Checks a key you already have (bundled in a page, pasted,
 * from a keyserver) against the owner's claims on Ethereum. `owner` is a 0x address or an ENS
 * name. Only a verified active claim counts, and a node failure is `unreachable`, never a
 * `mismatch`. The key is read before anything is asked of the node.
 */
export async function checkKeyFor(
  client: KeyCheckReader,
  { key, owner, registry }: { key: PgpInput; owner: string; registry?: Address },
): Promise<KeyCheck> {
  const info = await parsePgpKey(key)
  const fingerprint = info?.fingerprint ?? null
  const answer = (status: KeyCheckStatus, reason: string, rest: Partial<KeyCheck> = {}): KeyCheck =>
    ({ status, reason, fingerprint, claimedFingerprint: null, address: null, claim: null, ...rest })
  if (!fingerprint) return answer('mismatch', "This isn't a readable PGP key.")

  let address: Address | null
  if (isAddress(owner, { strict: false })) address = owner as Address
  else {
    let name: string
    try { name = normalize(owner) } catch { return answer('unverified', `${owner} isn't an address or an ENS name.`) }
    if (!client.getEnsAddress) throw new Error('checkKeyFor needs a client with getEnsAddress to look up ENS names')
    try { address = await client.getEnsAddress({ name }) } catch { return answer('unreachable', `Couldn't reach an Ethereum node to look up ${owner}.`) }
    if (!address) return answer('unverified', `${owner} doesn't point to an address.`)
  }

  let claims: Attestation[]
  try { claims = await readClaims(client, address, registry ? { registry } : {}) } catch {
    return answer('unreachable', `Couldn't reach an Ethereum node to check ${owner}.`, { address })
  }

  const standing = keyStanding(claims, { fingerprint })
  const upper = (c: Attestation) => c.fingerprint.toUpperCase()
  if (standing.kind === 'verified') {
    return answer('verified', `Matches the key ${owner} claimed on Ethereum.`, { address, claim: standing.claim, claimedFingerprint: upper(standing.claim) })
  }
  if (standing.kind === 'inactive') {
    const { claim } = standing
    const how = claim.revokeReason === 'compromised' ? 'marked this key compromised' : 'revoked this key'
    return answer('mismatch', `${owner} ${how} on ${formatClaimDate(claim.revokedAt)}.`, { address, claim, claimedFingerprint: upper(claim) })
  }
  if (standing.kind === 'not-counted') {
    const { claim } = standing
    const why = claim.verification?.kind ? ` (${CLAIM_CHECK_LABEL[claim.verification.kind]})` : ''
    return answer('unverified', `${owner} claimed this key, but the claim doesn't verify${why}.`, { address, claim, claimedFingerprint: upper(claim) })
  }
  const theirs = keyStanding(claims)
  if (theirs.kind === 'verified') {
    const claimed = upper(theirs.claim)
    return answer('mismatch', `${owner}'s verified key is ${claimed}, not this one.`, { address, claim: theirs.claim, claimedFingerprint: claimed })
  }
  return answer('unverified', `${owner} has no verified key on Ethereum.`, { address })
}
