import { describe, it, expect } from 'vitest'
import { attestTypedData, reattestTypedData, updateKeyTypedData, revokeTypedData, setRecordTypedData, markCompromisedTypedData, authorizationDigest, registryDomain, recordKind } from '../authorization'
import { hashDomain, getTypesForEIP712Domain, keccak256, stringToHex } from 'viem'

// Vectors from pgp-registry's PGPRegistryVectorTest (`forge test --match-contract PGPRegistryVectorTest -vv`):
// the registry accepted a permission signed over each digest, in this order, nonces 0 to 5.
const CHAIN = 31337
const REGISTRY = '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f' as const
const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const
const FP = '6E0053911942A889426C1866E34D9266098F7FE7'
const FP2 = '03E53D807CE38C130ED42ECECE3D0D7F0C9E5FB8'
const SIG = '0xc20b0401160a00000000000000'
const KEY = '0xc60b0400000000160900000000'
const KEY2 = '0xc60b0400000000160900000001'
const deadline = 1_800_000_000n

describe('EIP-712 permissions match the contract', () => {
  it('domain separator', () => {
    const domain = registryDomain(CHAIN, REGISTRY)
    expect(hashDomain({ domain, types: { EIP712Domain: getTypesForEIP712Domain({ domain }) } }))
      .toBe('0x1ae914dd6d6b3e7409a4a049571db5905d3496cea0fcb4c4e4b65d4d7fbd389e')
  })

  it('attest', () => {
    const td = attestTypedData(CHAIN, REGISTRY, { owner: OWNER, fingerprint: FP, signature: SIG, key: KEY, nonce: 0n, deadline })
    expect(authorizationDigest(td)).toBe('0x790b60582e916fb03848e6ce8dba9c4d839c6df9ac831cd5a4f144159d01debe')
  })

  it('setRecord', () => {
    const td = setRecordTypedData(CHAIN, REGISTRY, { owner: OWNER, index: 0n, kind: 'security', value: 'mailto:x@example.com', nonce: 1n, deadline })
    expect(authorizationDigest(td)).toBe('0x6704044192498930b03726a323665d5e4bd662be4e633e0a79b446f8e85f6845')
  })

  it('updateKey', () => {
    const td = updateKeyTypedData(CHAIN, REGISTRY, { owner: OWNER, index: 0n, key: KEY2, nonce: 2n, deadline })
    expect(authorizationDigest(td)).toBe('0xef234de23d790aa5ef038551e31dba634b5cbf06525604edb9eba79bb2962c1d')
  })

  it('reattest', () => {
    const td = reattestTypedData(CHAIN, REGISTRY, { owner: OWNER, revokeIndex: 0n, fingerprint: FP2, signature: SIG, key: KEY, keepRecords: true, nonce: 3n, deadline })
    expect(authorizationDigest(td)).toBe('0x5bfbb6a1ffe7f4516374b6b54833a6e184175881c8071877de5a8d00af9e17fd')
  })

  it('markCompromised', () => {
    const td = markCompromisedTypedData(CHAIN, REGISTRY, { owner: OWNER, index: 0n, nonce: 5n, deadline })
    expect(authorizationDigest(td)).toBe('0x7ae43484ef68e0a310e41e8d119a275f802779dd69af2e92adff92fb41e36f28')
  })

  it('revoke', () => {
    const td = revokeTypedData(CHAIN, REGISTRY, { owner: OWNER, index: 1n, reason: 'compromised', nonce: 4n, deadline })
    expect(authorizationDigest(td)).toBe('0x6b1e0db0719a0d43843e7201dbcc3bfb2fd7c7c77b1ec6485a1a85530c377774')
  })

  it('recordKind is keccak256 of the utf-8 name', () => {
    expect(recordKind('thurin.test')).toBe(keccak256(stringToHex('thurin.test')))
  })
})
