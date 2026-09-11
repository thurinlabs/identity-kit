import { describe, it, expect } from 'vitest'
import { attestTypedData, revokeTypedData, authorizationDigest, registryDomain, recordKind } from '../authorization'
import { hashDomain, getTypesForEIP712Domain, keccak256, stringToHex } from 'viem'

// Vector produced by pgp-registry's PGPRegistryVectorTest (forge test --match-contract PGPRegistryVectorTest -vv):
// chain 31337, registry 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f, owner 0x7099…79C8,
// fingerprint 6e0053911942a889426c1866e34d9266098f7fe7, sig "sig-bytes", key "key-bytes", nonce 3, deadline 1800000000.
const CHAIN = 31337
const REGISTRY = '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f' as const
const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

describe('EIP-712 authorizations match the contract', () => {
  it('domain separator', () => {
    const domain = registryDomain(CHAIN, REGISTRY)
    expect(hashDomain({ domain, types: { EIP712Domain: getTypesForEIP712Domain({ domain }) } }))
      .toBe('0x4992040b1813a7b5c538824962b8de9eafe1c9af18149b47b4a29b5cad62a1a8')
  })

  it('attest digest', () => {
    const td = attestTypedData(CHAIN, REGISTRY, {
      owner: OWNER,
      fingerprint: '6E0053911942A889426C1866E34D9266098F7FE7',
      pgpSignature: 'sig-bytes',
      pgpPublicKey: 'key-bytes',
      nonce: 3n,
      deadline: 1_800_000_000n,
    })
    expect(authorizationDigest(td)).toBe('0xe837e35fdb6307d9d769aa773c8f7c85e75d0962e1e7142802472fb96008978e')
  })

  it('revoke digest', () => {
    const td = revokeTypedData(CHAIN, REGISTRY, { owner: OWNER, index: 1n, nonce: 3n, deadline: 1_800_000_000n })
    expect(authorizationDigest(td)).toBe('0xbf1a584210116b45eeb0eb37f4895973e195b9b8e631c33f26d017f11079629a')
  })

  it('recordKind is keccak256 of the utf-8 name', () => {
    expect(recordKind('thurin.test')).toBe(keccak256(stringToHex('thurin.test')))
  })
})
