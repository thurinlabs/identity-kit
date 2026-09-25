import { hashTypedData, keccak256, stringToHex, type Hex, type TypedDataDomain } from 'viem'
import { fingerprintToBytes } from './fingerprint'

/**
 * EIP-712 permissions for the registry's relayed writes (`attestFor`, `reattestFor`,
 * `updateKeyFor`, `revokeFor`, `setRecordFor`, `markCompromisedFor`). The owner signs one; anyone can submit the
 * matching call and pay the gas. Every field is bound, plus the owner's `nonces(owner)` and a
 * `deadline`. The domain includes the chain id, so a permission can't be replayed on another network.
 */
export const EIP712_NAME = 'Thurin PGPRegistry'
export const EIP712_VERSION = '3'

export function registryDomain(chainId: number, verifyingContract: Hex): TypedDataDomain {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract }
}

export const AUTHORIZATION_TYPES = {
  Attest: [
    { name: 'owner', type: 'address' },
    { name: 'fingerprint', type: 'bytes' },
    { name: 'signature', type: 'bytes' },
    { name: 'key', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Reattest: [
    { name: 'owner', type: 'address' },
    { name: 'revokeIndex', type: 'uint256' },
    { name: 'fingerprint', type: 'bytes' },
    { name: 'signature', type: 'bytes' },
    { name: 'key', type: 'bytes' },
    { name: 'keepRecords', type: 'bool' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  UpdateKey: [
    { name: 'owner', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'key', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Revoke: [
    { name: 'owner', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'reason', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  SetRecord: [
    { name: 'owner', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'kind', type: 'string' },
    { name: 'value', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  MarkCompromised: [
    { name: 'owner', type: 'address' },
    { name: 'index', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export type AuthorizationAction = keyof typeof AUTHORIZATION_TYPES

/** Every revoke reason a claim can show ('' = none given). "superseded" is set only by reattest. */
export const REVOKE_REASONS = ['', 'compromised', 'retired', 'superseded', 'other'] as const
export type RevokeReason = (typeof REVOKE_REASONS)[number]
/** The reasons an owner can give to `revoke`. "compromised" is final: that address can never claim the key again. */
export const OWNER_REVOKE_REASONS = ['', 'compromised', 'retired', 'other'] as const

interface Common { owner: Hex; nonce: bigint; deadline: bigint }
/** `signature` and `key` are the raw bytes as `0x…` hex (or a clearsigned message as text). */
export type AttestAuthorization = Common & { fingerprint: string; signature: string; key: string }
export type ReattestAuthorization = AttestAuthorization & { revokeIndex: bigint; keepRecords: boolean }
export type UpdateKeyAuthorization = Common & { index: bigint; key: string }
export type RevokeAuthorization = Common & { index: bigint; reason?: RevokeReason }
/** `kind` exactly as it will be submitted (the registry adds `thurin.` to undotted names itself). */
export type SetRecordAuthorization = Common & { index: bigint; kind: string; value: string }
/** Mark an already revoked or replaced claim compromised (`markCompromisedFor`). A Revoke permission never can. */
export type MarkCompromisedAuthorization = Common & { index: bigint }

/** `0x…` hex is raw bytes; anything else (a clearsigned message) is UTF-8 text. */
function payloadBytes(v: string): Hex {
  return /^0x([0-9a-fA-F]{2})*$/.test(v) ? (v as Hex) : stringToHex(v)
}

/** The object to pass to viem/wagmi `signTypedData`. */
export function attestTypedData(chainId: number, registry: Hex, a: AttestAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { Attest: AUTHORIZATION_TYPES.Attest },
    primaryType: 'Attest' as const,
    message: {
      owner: a.owner,
      fingerprint: fingerprintToBytes(a.fingerprint),
      signature: payloadBytes(a.signature),
      key: payloadBytes(a.key),
      nonce: a.nonce,
      deadline: a.deadline,
    },
  }
}

export function reattestTypedData(chainId: number, registry: Hex, a: ReattestAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { Reattest: AUTHORIZATION_TYPES.Reattest },
    primaryType: 'Reattest' as const,
    message: {
      owner: a.owner,
      revokeIndex: a.revokeIndex,
      fingerprint: fingerprintToBytes(a.fingerprint),
      signature: payloadBytes(a.signature),
      key: payloadBytes(a.key),
      keepRecords: a.keepRecords,
      nonce: a.nonce,
      deadline: a.deadline,
    },
  }
}

export function updateKeyTypedData(chainId: number, registry: Hex, a: UpdateKeyAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { UpdateKey: AUTHORIZATION_TYPES.UpdateKey },
    primaryType: 'UpdateKey' as const,
    message: { owner: a.owner, index: a.index, key: payloadBytes(a.key), nonce: a.nonce, deadline: a.deadline },
  }
}

export function revokeTypedData(chainId: number, registry: Hex, a: RevokeAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { Revoke: AUTHORIZATION_TYPES.Revoke },
    primaryType: 'Revoke' as const,
    message: { owner: a.owner, index: a.index, reason: a.reason ?? '', nonce: a.nonce, deadline: a.deadline },
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

export function markCompromisedTypedData(chainId: number, registry: Hex, a: MarkCompromisedAuthorization) {
  return {
    domain: registryDomain(chainId, registry),
    types: { MarkCompromised: AUTHORIZATION_TYPES.MarkCompromised },
    primaryType: 'MarkCompromised' as const,
    message: { owner: a.owner, index: a.index, nonce: a.nonce, deadline: a.deadline },
  }
}

/** The digest the registry recovers the signer from. */
export function authorizationDigest(typedData: ReturnType<typeof attestTypedData | typeof reattestTypedData | typeof updateKeyTypedData | typeof revokeTypedData | typeof setRecordTypedData | typeof markCompromisedTypedData>): Hex {
  return hashTypedData(typedData as any)
}

/** The hash the registry indexes a record name by (the `kindHash` in `RecordSet` events). */
export function recordKind(name: string): Hex {
  return keccak256(stringToHex(name))
}
