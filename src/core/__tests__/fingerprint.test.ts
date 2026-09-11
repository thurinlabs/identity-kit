import { describe, it, expect } from 'vitest'
import { normalizeFingerprint, fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes } from '../fingerprint'

const V4 = '6E0053911942A889426C1866E34D9266098F7FE7'
const V6 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('fingerprint helpers', () => {
  it('normalizes case, spaces and 0x', () => {
    expect(normalizeFingerprint('6E00 5391 1942 A889 426C  1866 E34D 9266 098F 7FE7')).toBe(V4.toLowerCase())
    expect(normalizeFingerprint('0x' + V4)).toBe(V4.toLowerCase())
    expect(normalizeFingerprint(V6)).toBe(V6)
    expect(normalizeFingerprint('abc')).toBeNull()
    expect(normalizeFingerprint(V4 + '0')).toBeNull()
    expect(normalizeFingerprint('ZZ' + V4.slice(2))).toBeNull()
  })

  it('round-trips through bytes', () => {
    const b = fingerprintToBytes(V4)
    expect(b).toBe('0x' + V4.toLowerCase())
    expect(bytesToFingerprint(b)).toBe(V4.toLowerCase())
    expect(fingerprintToBytes(V6).length).toBe(66)
    expect(() => fingerprintToBytes('nope')).toThrow()
  })

  it('hashes and derives key ids like the contract', () => {
    // keccak256 of the raw 20 bytes — the value the registry indexes addressesFor by
    expect(fingerprintHash(V4)).toMatch(/^0x[0-9a-f]{64}$/)
    expect(fingerprintHash(V4)).toBe(fingerprintHash(V4.toLowerCase()))
    expect(keyIdOf(V4)).toBe('0xe34d9266098f7fe7')
    expect(keyIdOf(V6)).toBe('0x0123456789abcdef')
    expect(keyIdToBytes('E34D 9266 098F 7FE7')).toBe('0xe34d9266098f7fe7')
    expect(keyIdToBytes('0xE34D9266098F7FE7')).toBe('0xe34d9266098f7fe7')
    expect(keyIdToBytes('12345')).toBeNull()
  })
})
