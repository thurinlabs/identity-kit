// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest'
import * as openpgp from 'openpgp'
import { stringToHex } from 'viem'
import { checkKeyFor } from '../checkKey'

// Throwaway keys made here: `mine` and `older` are the owner's, `stranger` is someone else's.
const OWNER = '0x1111111111111111111111111111111111111111' as const
const NAME = 'owner.eth'

async function makeKey() {
  const { privateKey } = await openpgp.generateKey({ type: 'ecc', curve: 'ed25519Legacy', userIDs: [{ name: 'Check Test' }], format: 'object' })
  const message = await openpgp.createCleartextMessage({ text: `I control the Ethereum address: ${OWNER}` })
  const signature = await openpgp.sign({ message, signingKeys: privateKey }) as string
  return { armored: privateKey.toPublic().armor(), fingerprint: privateKey.getFingerprint(), signature }
}
type Made = Awaited<ReturnType<typeof makeKey>>
let mine: Made, older: Made, stranger: Made
beforeAll(async () => { [mine, older, stranger] = await Promise.all([makeKey(), makeKey(), makeKey()]) })

interface Row { key: Made; revoked?: 'compromised' | 'retired'; badSignature?: boolean }

/** A node stub: `rows` as the owner's claims, ENS names in `names`, `down` fails every read. */
type Names = Record<string, `0x${string}` | null>
function node(rows: Row[], { names = { [NAME]: OWNER } as Names, down = false }: { names?: Names; down?: boolean } = {}) {
  const readContract = vi.fn(async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
    if (down) throw new Error('fetch failed')
    if (functionName === 'claimsOf') return rows.map(r => ({
      fingerprint: `0x${r.key.fingerprint}`, createdAt: 1767225600n, revokedAt: r.revoked ? 1767312000n : 0n,
      state: r.revoked ? 'revoked' : 'active', replacedBy: 0n, revokeReason: r.revoked ?? '', messageVersion: 0n,
    }))
    const r = rows[Number(args[1])]
    if (functionName === 'keyBytes') return stringToHex(r.key.armored)
    return stringToHex(r.badSignature ? stranger.signature : r.key.signature)
  })
  const getEnsAddress = vi.fn(async ({ name }: { name: string }) => {
    if (down) throw new Error('fetch failed')
    return names[name] ?? null
  })
  return { readContract, getEnsAddress }
}

describe('checkKeyFor', () => {
  it('verified: matches an active verified claim, by address or ENS name', async () => {
    const r = await checkKeyFor(node([{ key: mine }]), { key: mine.armored, owner: OWNER })
    expect(r).toMatchObject({ status: 'verified', fingerprint: mine.fingerprint.toUpperCase(), claimedFingerprint: mine.fingerprint.toUpperCase(), address: OWNER })
    expect(r.reason).toBe(`Matches the key ${OWNER} claimed on Ethereum.`)
    expect((await checkKeyFor(node([{ key: mine }]), { key: mine.armored, owner: NAME })).status).toBe('verified')
  })

  it('verified: an older key that is still active counts, not only the newest', async () => {
    const r = await checkKeyFor(node([{ key: older }, { key: mine }]), { key: older.armored, owner: NAME })
    expect(r).toMatchObject({ status: 'verified', claimedFingerprint: older.fingerprint.toUpperCase() })
  })

  it('mismatch: the owner verified another key, and says which', async () => {
    const r = await checkKeyFor(node([{ key: mine }]), { key: stranger.armored, owner: NAME })
    expect(r).toMatchObject({ status: 'mismatch', fingerprint: stranger.fingerprint.toUpperCase(), claimedFingerprint: mine.fingerprint.toUpperCase() })
    expect(r.reason).toBe(`${NAME}'s verified key is ${mine.fingerprint.toUpperCase()}, not this one.`)
  })

  it('mismatch: the owner revoked this key, compromised or not', async () => {
    const compromised = await checkKeyFor(node([{ key: older, revoked: 'compromised' }, { key: mine }]), { key: older.armored, owner: NAME })
    expect(compromised).toMatchObject({ status: 'mismatch', reason: `${NAME} marked this key compromised on Jan 2, 2026.` })
    const retired = await checkKeyFor(node([{ key: older, revoked: 'retired' }]), { key: older.armored, owner: NAME })
    expect(retired).toMatchObject({ status: 'mismatch', reason: `${NAME} revoked this key on Jan 2, 2026.` })
  })

  it('mismatch: not a readable key, and the node is never asked', async () => {
    const n = node([{ key: mine }])
    const r = await checkKeyFor(n, { key: 'not a key', owner: NAME })
    expect(r).toMatchObject({ status: 'mismatch', fingerprint: null, reason: "This isn't a readable PGP key." })
    expect(n.readContract).not.toHaveBeenCalled()
    expect(n.getEnsAddress).not.toHaveBeenCalled()
  })

  it('unverified: the claim for this key does not verify, and says why', async () => {
    const r = await checkKeyFor(node([{ key: mine, badSignature: true }]), { key: mine.armored, owner: NAME })
    expect(r.status).toBe('unverified')
    expect(r.reason).toMatch(new RegExp(`^${NAME} claimed this key, but the claim doesn't verify \\(.+\\)\\.$`))
  })

  it('unverified: no verified key, no claims, or a name that points nowhere', async () => {
    const none = await checkKeyFor(node([]), { key: mine.armored, owner: NAME })
    expect(none).toMatchObject({ status: 'unverified', reason: `${NAME} has no verified key on Ethereum.`, address: OWNER })
    const unset = await checkKeyFor(node([], { names: {} }), { key: mine.armored, owner: 'nobody.eth' })
    expect(unset).toMatchObject({ status: 'unverified', reason: "nobody.eth doesn't point to an address.", address: null })
    const junk = await checkKeyFor(node([]), { key: mine.armored, owner: 'not a name!' })
    expect(junk.status).toBe('unverified')
  })

  it('unreachable: a node failure is never a mismatch', async () => {
    const byName = await checkKeyFor(node([{ key: mine }], { down: true }), { key: stranger.armored, owner: NAME })
    expect(byName).toMatchObject({ status: 'unreachable', reason: `Couldn't reach an Ethereum node to look up ${NAME}.` })
    const byAddress = await checkKeyFor(node([{ key: mine }], { down: true }), { key: stranger.armored, owner: OWNER })
    expect(byAddress).toMatchObject({ status: 'unreachable', address: OWNER })
  })
})
