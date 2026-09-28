import { describe, it, expect, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { serializeErc6492Signature, getAddress, type Hex } from 'viem'
import { attestTypedData, permissionSigned } from '../authorization'

// Public anvil test keys. `alice` owns the claim; `bob` is someone else (or one of a Safe's owners).
const alice = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
const bob = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const SAFE = getAddress('0x5afe000000000000000000000000000000000001')
const REGISTRY = '0xFa6956c11163517249f8A67F5560a4406B519451' as Hex

const permission = (owner: Hex) => attestTypedData(1, REGISTRY, {
  owner, fingerprint: '0123456789ABCDEF0123456789ABCDEF01234567', signature: '0xc20b0401', key: '0xc60b0400', nonce: 0n, deadline: 1_800_000_000n,
})

function chain(code: Hex, answer?: string) {
  const readContract = vi.fn(async () => { if (answer === undefined) throw new Error('reverted'); return answer })
  return { client: { getCode: vi.fn(async () => code), readContract }, readContract }
}

describe('permissionSigned: the registry\'s rule, off-chain', () => {
  it('accepts a plain signature from the owner', async () => {
    const typed = permission(alice.address)
    const sig = await alice.signTypedData(typed as any)
    expect(await permissionSigned(chain('0x').client, typed, sig, alice.address)).toEqual({ ok: true })
  })

  it('accepts an EIP-7702 account signing with its own key, without asking the contract', async () => {
    const typed = permission(alice.address)
    const sig = await alice.signTypedData(typed as any)
    const c = chain('0xef01005a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d')
    expect(await permissionSigned(c.client, typed, sig, alice.address)).toEqual({ ok: true })
    expect(c.readContract).not.toHaveBeenCalled()
  })

  it('names the real signer when someone else signed', async () => {
    const typed = permission(alice.address)
    const sig = await bob.signTypedData(typed as any)
    const r = await permissionSigned(chain('0x').client, typed, sig, alice.address)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.signer).toBe(bob.address)
  })

  it('accepts a contract account that says the signature is its own (EIP-1271)', async () => {
    const typed = permission(SAFE)
    const sig = await bob.signTypedData(typed as any)
    expect(await permissionSigned(chain('0x6080', '0x1626ba7e').client, typed, sig, SAFE)).toEqual({ ok: true })
  })

  it('refuses when the contract account says no, or reverts', async () => {
    const typed = permission(SAFE)
    const sig = await bob.signTypedData(typed as any)
    expect((await permissionSigned(chain('0x6080', '0xffffffff').client, typed, sig, SAFE)).ok).toBe(false)
    expect((await permissionSigned(chain('0x6080').client, typed, sig, SAFE)).ok).toBe(false)
  })

  it('explains an ERC-6492 signature from an account not on-chain yet', async () => {
    const typed = permission(SAFE)
    const inner = await bob.signTypedData(typed as any)
    const wrapped = serializeErc6492Signature({ address: '0x0000000000000000000000000000000000000abc', data: '0x1234', signature: inner })
    const r = await permissionSigned(chain('0x').client, typed, wrapped, SAFE)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/isn't on-chain yet/)
  })
})
