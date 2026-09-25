import { hashTypedData, keccak256, stringToHex, type Hex, type TypedDataDomain } from 'viem'
import { fingerprintToBytes } from './fingerprint'

/**
 * EIP-712 authorizations for the registry's relayed writes (`attestFor`, `reattestFor`,
 * `updateKeyFor`, `revokeFor`, `setRecordFor`). The owner signs one of these typed
 * structs; anyone can then submit the matching call and pay the gas. Every field is
 * bound, plus the owner's current `nonce` (read with `nonces(owner)`) and a `deadline`.
 *
 * The domain includes the chain id, so an authorization for one network cannot be
 * replayed on another even though the registry has the same address everywhere.
 */
export const EIP712_NAME = 'Thurin PGPRegistry'
export const EIP712_VERSION = '2'

export function registryDomain(chainId: number, verifyingContract: Hex): TypedDataDomain {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract }
}

export const AUTHORIZATION_TYPES = {
  Attest: [
    { name: 'owner', type: 'address' },
    { name: 'fingerprint', type: 'bytes' },
    { name: 'pgpSignature', type: 'bytes' },
    { name: 'pgpPublicKey', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Reattest: [
    { name: 'owner', type: 'address' },
    { name: 'revokeIndex', type: 'uint256' },
    { name: 'fingerprint', type: 'bytes' },
    { name: 'pgpSignature', type: 'bytes' },
    { name: 'pgpPublicKey', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  UpdateKey: [
    { name: 'owner', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'pgpPublicKey', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Revoke: [
    { name: 'owner', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  SetRecord: [
    { name: 'owner', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'kind', type: 'bytes32' },
    { name: 'value', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export type AuthorizationAction = keyof typeof AUTHORIZATION_TYPES

interface Common { owner: Hex; nonce: bigint; deadline: bigint }
export type AttestAuthorization = Common & { fingerprint: string; pgpSignature: string; pgpPublicKey: string }
export type ReattestAuthorization = AttestAuthorization & { revokeIndex: bigint }
export type UpdateKeyAuthorization = Common & { index: bigint; pgpPublicKey: string }
export type RevokeAuthorization = Common & { index: bigint }
export type SetRecordAuthorization = Common & { index: bigint; kind: Hex; value: Hex }

/** Payload bytes as submitted: `0x…` hex is taken as raw bytes (the lean format), anything else as UTF-8 text (armored). */
function payloadBytes(v: string): Hex {
  return /^0x([0-9a-fA-F]{2})*$/.test(v) ? (v as Hex) : stringToHex(v)
}

/**
 * Build the object to pass to viem/wagmi `signTypedData`. `fingerprint` is the hex
 * fingerprint; `pgpSignature` / `pgpPublicKey` are exactly what will be submitted: `0x…` hex
 * for raw bytes (the lean format), or armored text (hashed as UTF-8 bytes).
 */
export function attestTypedData(chainId: number, registry: Hex, a: AttestAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { Attest: AUTHORIZATION_TYPES.Attest },
    primaryType: 'Attest' as const,
    message: {
      owner: a.owner,
      fingerprint: fingerprintToBytes(a.fingerprint),
      pgpSignature: payloadBytes(a.pgpSignature),
      pgpPublicKey: payloadBytes(a.pgpPublicKey),
      nonce: a.nonce,
      deadline: a.deadline,
    },
  }
}

export function reattestTypedData(chainId: number, registry: Hex, a: ReattestAuthorization) {
  const base = attestTypedData(chainId, registry, a)
  return {
    domain: base.domain,
    types: { Reattest: AUTHORIZATION_TYPES.Reattest },
    primaryType: 'Reattest' as const,
    message: { ...base.message, revokeIndex: a.revokeIndex },
  }
}

export function updateKeyTypedData(chainId: number, registry: Hex, a: UpdateKeyAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { UpdateKey: AUTHORIZATION_TYPES.UpdateKey },
    primaryType: 'UpdateKey' as const,
    message: { owner: a.owner, index: a.index, pgpPublicKey: payloadBytes(a.pgpPublicKey), nonce: a.nonce, deadline: a.deadline },
  }
}

export function revokeTypedData(chainId: number, registry: Hex, a: RevokeAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { Revoke: AUTHORIZATION_TYPES.Revoke },
    primaryType: 'Revoke' as const,
    message: { owner: a.owner, index: a.index, nonce: a.nonce, deadline: a.deadline },
  }
}

export function setRecordTypedData(chainId: number, registry: Hex, a: SetRecordAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { SetRecord: AUTHORIZATION_TYPES.SetRecord },
    primaryType: 'SetRecord' as const,
    message: { owner: a.owner, index: a.index, kind: a.kind, value: a.value, nonce: a.nonce, deadline: a.deadline },
  }
}

/** The digest the registry recovers the signer from — handy for tests and CLIs. */
export function authorizationDigest(typedData: ReturnType<typeof attestTypedData | typeof reattestTypedData | typeof updateKeyTypedData | typeof revokeTypedData | typeof setRecordTypedData>): Hex {
  return hashTypedData(typedData as any)
}

/** `bytes32 kind` for a record from a human-readable name, e.g. recordKind('thurin.vouch'). */
export function recordKind(name: string): Hex {
  return keccak256(stringToHex(name))
}
