import { describe, it, expect } from 'vitest'
import { normalizeFingerprint, sameFingerprint, fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes } from '../fingerprint'

const V4 = '6E0053911942A889426C1866E34D9266098F7FE7'
const V6 = '00112233445566778899aabbccddeeff0f1e2d3c4b5a69788796a5b4c3d2e1f0' // asymmetric: key id = first 8 bytes

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
    // keccak256 of the raw 20 bytes: the registry's fingerprintHash
    expect(fingerprintHash(V4)).toMatch(/^0x[0-9a-f]{64}$/)
    expect(fingerprintHash(V4)).toBe(fingerprintHash(V4.toLowerCase()))
    expect(keyIdOf(V4)).toBe('0xe34d9266098f7fe7')
    expect(keyIdOf(V6)).toBe('0x0011223344556677') // RFC 9580: v6 key id is the high-order 8 bytes
    expect(keyIdToBytes('E34D 9266 098F 7FE7')).toBe('0xe34d9266098f7fe7')
    expect(keyIdToBytes('0xE34D9266098F7FE7')).toBe('0xe34d9266098f7fe7')
    expect(keyIdToBytes('12345')).toBeNull()
  })
})

describe('sameFingerprint', () => {
  it('ignores case, spaces, and 0x; never matches malformed input', () => {
    expect(sameFingerprint('08B9 374F DFBE C67E FFA2  4E66 9D3D 86E3 5361 EF7B', '0x08b9374fdfbec67effa24e669d3d86e35361ef7b')).toBe(true)
    expect(sameFingerprint('08b9374fdfbec67effa24e669d3d86e35361ef7b', 'aa'.repeat(20))).toBe(false)
    expect(sameFingerprint('nope', 'nope')).toBe(false)
    expect(sameFingerprint(null, null)).toBe(false)
  })
})
