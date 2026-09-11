import { keccak256, type Hex } from 'viem'

/** 40 hex chars (OpenPGP v4) or 64 hex chars (v6), spaces/0x tolerated. */
const FINGERPRINT_HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

/** Normalize a fingerprint to lowercase hex with no prefix or spaces. Returns null if malformed. */
export function normalizeFingerprint(input: string): string | null {
  const hex = input.replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase()
  return FINGERPRINT_HEX.test(hex) ? hex : null
}

/** Fingerprint → the raw `bytes` argument the v2 registry takes (0x-prefixed, 20 or 32 bytes). */
export function fingerprintToBytes(fingerprint: string): Hex {
  const hex = normalizeFingerprint(fingerprint)
  if (!hex) throw new Error(`Invalid PGP fingerprint: ${fingerprint}`)
  return `0x${hex}`
}

/** Raw `bytes` from the registry → lowercase hex fingerprint without 0x. */
export function bytesToFingerprint(bytes: Hex | string): string {
  return bytes.replace(/^0x/i, '').toLowerCase()
}

/** keccak256 of the raw fingerprint bytes — the `fingerprintHash` the registry indexes by. */
export function fingerprintHash(fingerprint: string): Hex {
  return keccak256(fingerprintToBytes(fingerprint))
}

/** The long key ID (last 8 bytes of the fingerprint) as the `bytes8` the registry takes. */
export function keyIdOf(fingerprint: string): Hex {
  const hex = normalizeFingerprint(fingerprint)
  if (!hex) throw new Error(`Invalid PGP fingerprint: ${fingerprint}`)
  return `0x${hex.slice(-16)}`
}

/** A 16-hex long key ID (spaces/0x tolerated) → `bytes8`. */
export function keyIdToBytes(keyId: string): Hex | null {
  const hex = keyId.replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase()
  return /^[0-9a-f]{16}$/.test(hex) ? `0x${hex}` : null
}
