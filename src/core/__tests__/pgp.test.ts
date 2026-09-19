import { describe, it, expect, vi } from 'vitest'

// A fake openpgp self-certification. `valid` controls whether its signature
// verifies against the primary key (verify() rejects on an invalid signature).
function fakeCert(valid: boolean, notations: { name: string; value: string }[]) {
  return {
    signatureType: 0x13, // certPositive
    rawNotations: notations,
    verify: valid
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(new Error('invalid signature')),
  }
}

// Mock openpgp.readKey to return a hand-built key with two users: one whose
// self-certification verifies against the primary key and one whose does not.
// Both carry proof notations.
vi.mock('openpgp', () => ({
  config: {}, // pgp.ts builds its config from the library defaults
  readKey: vi.fn(async () => ({
    getFingerprint: () => 'ae3aabc506cbaaa34d744fd2886704ebb2640781',
    keyPacket: { algorithm: 'eddsa', created: new Date(0) },
    getExpirationTime: async () => Infinity,
    users: [
      {
        userID: { userID: 'Alice <alice@example.com>' },
        selfCertifications: [
          fakeCert(true, [{ name: 'proof@thurin.id', value: 'https://real.example/proof' }]),
        ],
      },
      {
        userID: { userID: 'Unverified <unverified@example.com>' },
        selfCertifications: [
          fakeCert(false, [{ name: 'proof@thurin.id', value: 'https://unverified.example/proof' }]),
        ],
      },
    ],
    subkeys: [],
  })),
}))

import { parsePgpKey } from '../pgp'

describe('parsePgpKey self-certification verification', () => {
  it('keeps user IDs and notations from verified self-certifications', async () => {
    const info = await parsePgpKey('dummy-armored')
    expect(info).not.toBeNull()
    expect(info!.userIDs).toContain('Alice <alice@example.com>')
    expect(info!.notations).toContainEqual({
      name: 'proof@thurin.id',
      value: 'https://real.example/proof',
    })
  })

  it('drops user IDs and notations from self-certifications that do not verify', async () => {
    const info = await parsePgpKey('dummy-armored')
    expect(info!.userIDs).not.toContain('Unverified <unverified@example.com>')
    expect(info!.notations).not.toContainEqual({
      name: 'proof@thurin.id',
      value: 'https://unverified.example/proof',
    })
  })
})
