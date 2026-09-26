// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { REGISTRY_ABI } from '../contract'
import { CONTRACT_ERROR_TEXT, contractErrorName, contractErrorText } from '../contractErrors'

describe('contract error text', () => {
  it('has a sentence for every custom error in the ABI, and none extra', () => {
    const names = REGISTRY_ABI.filter((x: any) => x.type === 'error').map((x: any) => x.name).sort()
    expect(Object.keys(CONTRACT_ERROR_TEXT).sort()).toEqual(names)
  })
  it('finds the error name down a viem cause chain', () => {
    const viemLike = { shortMessage: 'The contract function "setRecordFor" reverted.', cause: { name: 'ContractFunctionRevertedError', data: { errorName: 'PermissionExpired', args: [1n] } } }
    expect(contractErrorName(viemLike)).toBe('PermissionExpired')
    expect(contractErrorText(viemLike)).toMatch(/past its deadline/)
  })
  it('is null for anything that is not a revert', () => {
    expect(contractErrorName(new Error('fetch failed'))).toBeNull()
    expect(contractErrorText(undefined)).toBeNull()
  })
})
