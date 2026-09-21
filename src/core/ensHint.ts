import { namehash, normalize } from 'viem/ens'
import { normalizeFingerprint } from './fingerprint'

/**
 * The `id.thurin` ENS text record: a name points at the PGP key claimed on the Thurin
 * registry by the address the name resolves to. It is a discovery hint, not part of the
 * trust chain — the name owner set the address, the address signed the claim, so a reader
 * verifies by resolving the name and reading the registry. The record only says where to
 * look. `id.thurin` is a service key under ENSIP-5 (reverse-dot of thurin.id); ENSIP-18
 * says service-key values are bare, so the value is the 40-hex fingerprint, uppercase.
 */
export const ENS_HINT_KEY = 'id.thurin' as const

export type EnsHintState = 'match' | 'unset' | 'mismatch'

export interface EnsHint {
  key: typeof ENS_HINT_KEY
  state: EnsHintState
  /** The raw record value, or null when the name carries no record. */
  record: string | null
  /** The record as a lowercase fingerprint, or null when it does not parse as one. */
  fingerprint: string | null
  /** The verified claim's fingerprint (lowercase) the record is compared against, if any. */
  expected: string | null
  /** Why a record does not match; absent for `match` and `unset`. */
  reason?: string
}

/**
 * Compare a name's `id.thurin` record with the fingerprint the registry verifies for the
 * name's address. Parsing is lenient (case, spaces, 0x); what Thurin writes is strict.
 */
export function ensHintFor(record: string | null | undefined, verifiedFingerprint: string | null | undefined): EnsHint {
  const raw = record?.trim() ?? ''
  const expected = verifiedFingerprint ? normalizeFingerprint(verifiedFingerprint) : null
  if (!raw) return { key: ENS_HINT_KEY, state: 'unset', record: null, fingerprint: null, expected }
  const fingerprint = normalizeFingerprint(raw)
  if (!fingerprint) return { key: ENS_HINT_KEY, state: 'mismatch', record: raw, fingerprint: null, expected, reason: 'The record is not a PGP fingerprint' }
  if (!expected) return { key: ENS_HINT_KEY, state: 'mismatch', record: raw, fingerprint, expected, reason: 'The address has no verified claim' }
  if (fingerprint === expected) return { key: ENS_HINT_KEY, state: 'match', record: raw, fingerprint, expected }
  return { key: ENS_HINT_KEY, state: 'mismatch', record: raw, fingerprint, expected, reason: 'The record names a key this address has not claimed' }
}

/** The value Thurin writes: the fingerprint, uppercase, bare. */
export function ensHintValue(fingerprint: string): string {
  const fp = normalizeFingerprint(fingerprint)
  if (!fp) throw new Error(`Not a fingerprint: ${fingerprint}`)
  return fp.toUpperCase()
}

/** The `text` / `setText` pair every ENS resolver speaks (ENSIP-5); the same on ENSv2. */
export const ENS_TEXT_RESOLVER_ABI = [
  { type: 'function', name: 'text', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'setText', stateMutability: 'nonpayable', inputs: [{ name: 'node', type: 'bytes32' }, { name: 'key', type: 'string' }, { name: 'value', type: 'string' }], outputs: [] },
] as const

/**
 * The `setText` call that links a name to a claim. The resolver address is not part of it
 * on purpose: look it up at write time (`client.getEnsResolver({ name })`) — on ENSv2 every
 * account has its own resolver, so a cached or hardcoded one is the wrong contract.
 */
export function ensHintWrite(name: string, fingerprint: string) {
  const normalized = normalize(name)
  return {
    abi: ENS_TEXT_RESOLVER_ABI,
    functionName: 'setText' as const,
    args: [namehash(normalized), ENS_HINT_KEY, ensHintValue(fingerprint)] as const,
    name: normalized,
  }
}

/** Minimal client shape: viem's PublicClient has both. */
export interface EnsTextReader {
  getEnsText(args: { name: string; key: string }): Promise<string | null>
}

/** Read a name's `id.thurin` record and compare it with the verified fingerprint. */
export async function fetchEnsHint(client: EnsTextReader, name: string, verifiedFingerprint: string | null | undefined): Promise<EnsHint> {
  const record = await client.getEnsText({ name: normalize(name), key: ENS_HINT_KEY })
  return ensHintFor(record, verifiedFingerprint)
}
