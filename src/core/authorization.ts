import { hashTypedData, keccak256, stringToHex, recoverTypedDataAddress, isErc6492Signature, type Hex, type TypedDataDomain } from 'viem'
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

/** Any client with viem's `getCode` and `readContract` (a viem PublicClient, or a stub in tests). */
export interface PermissionReader {
  getCode(args: { address: Hex }): Promise<Hex | undefined>
  readContract(args: any): Promise<unknown>
}

export type PermissionCheck = { ok: true } | { ok: false; reason: string; signer?: Hex }

const ERC1271_MAGIC = '0x1626ba7e'
const ERC1271_ABI = [{
  type: 'function', name: 'isValidSignature', stateMutability: 'view',
  inputs: [{ name: 'hash', type: 'bytes32' }, { name: 'signature', type: 'bytes' }],
  outputs: [{ name: '', type: 'bytes4' }],
}] as const

/**
 * Is `signature` a permission from `owner`? Judged the way the registry judges it: a plain signature
 * from the owner's key (any address, EIP-7702 accounts included), else, for an account with code (a
 * Safe, a smart-account wallet), the account's own answer (EIP-1271). An ERC-6492 signature (from an
 * account not on-chain yet) is refused with the reason: the registry asks the deployed account.
 * `signer` is set when a plain signature came from someone else.
 */
export async function permissionSigned(client: PermissionReader, typedData: Parameters<typeof authorizationDigest>[0], signature: Hex, owner: Hex): Promise<PermissionCheck> {
  const code = await client.getCode({ address: owner }).catch(() => undefined)
  const deployed = !!code && code !== '0x'

  if (isErc6492Signature(signature)) {
    return { ok: false, reason: deployed
      ? 'This signature was made before the account was on-chain. Sign again, now that it is'
      : "This smart account isn't on-chain yet, so the registry can't check its signature. Send any transaction from it first (that creates it), then sign again" }
  }

  const signer = await recoverTypedDataAddress({ ...(typedData as any), signature }).catch(() => undefined)
  if (signer && signer.toLowerCase() === owner.toLowerCase()) return { ok: true }

  if (deployed) {
    const answer = await client.readContract({
      address: owner, abi: ERC1271_ABI, functionName: 'isValidSignature', args: [authorizationDigest(typedData), signature],
    }).catch(() => undefined)
    if (answer === ERC1271_MAGIC) return { ok: true }
    return { ok: false, reason: `The account ${owner} doesn't accept this signature as its own` }
  }
  return { ok: false, reason: signer ? `The signature is from ${signer}, not ${owner}` : "The signature can't be read", signer }
}

/** The hash the registry indexes a record name by (the `kindHash` in `RecordSet` events). */
export function recordKind(name: string): Hex {
  return keccak256(stringToHex(name))
}
