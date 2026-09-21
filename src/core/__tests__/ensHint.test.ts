import { describe, it, expect } from 'vitest'
import { ENS_HINT_KEY, ensHintFor, ensHintValue, ensHintWrite, fetchEnsHint } from '../ensHint'

const BEN = '6E0053911942A889426C1866E34D9266098F7FE7'
const CO = '08B9374FDFBEC67EFFA24E669D3D86E35361EF7B'

describe('ensHintFor', () => {
  it('matches a bare uppercase record against the verified claim', () => {
    const h = ensHintFor(BEN, BEN.toLowerCase())
    expect(h.state).toBe('match')
    expect(h.fingerprint).toBe(BEN.toLowerCase())
    expect(h.expected).toBe(BEN.toLowerCase())
    expect(h.reason).toBeUndefined()
  })
  it('reads leniently: case, spaces, 0x', () => {
    expect(ensHintFor('6e00 5391 1942 a889 426c 1866 e34d 9266 098f 7fe7', BEN).state).toBe('match')
    expect(ensHintFor('0x' + BEN, BEN).state).toBe('match')
  })
  it('is unset for a missing or empty record', () => {
    expect(ensHintFor(null, BEN).state).toBe('unset')
    expect(ensHintFor('', BEN).state).toBe('unset')
    expect(ensHintFor('  ', BEN).record).toBeNull()
  })
  it('flags a record that is not a fingerprint (the trailing-period typo)', () => {
    const h = ensHintFor(BEN + '.', BEN)
    expect(h.state).toBe('mismatch')
    expect(h.fingerprint).toBeNull()
    expect(h.record).toBe(BEN + '.')
    expect(h.reason).toMatch(/not a PGP fingerprint/)
  })
  it('flags a record naming a key the address has not claimed', () => {
    const h = ensHintFor(CO, BEN)
    expect(h.state).toBe('mismatch')
    expect(h.reason).toMatch(/not claimed/)
  })
  it('cannot match when the address has no verified claim', () => {
    const h = ensHintFor(BEN, null)
    expect(h.state).toBe('mismatch')
    expect(h.reason).toMatch(/no verified claim/)
    expect(ensHintFor(null, null).state).toBe('unset')
  })
})

describe('ensHintValue / ensHintWrite', () => {
  it('writes the bare uppercase form whatever it was given', () => {
    expect(ensHintValue('6e00 5391 1942 a889 426c 1866 e34d 9266 098f 7fe7')).toBe(BEN)
    expect(() => ensHintValue('nope')).toThrow()
  })
  it('builds the setText call on the normalized name', () => {
    const w = ensHintWrite('Ben.ThurinLabs.eth', BEN.toLowerCase())
    expect(w.name).toBe('ben.thurinlabs.eth')
    expect(w.functionName).toBe('setText')
    expect(w.args[0]).toMatch(/^0x[0-9a-f]{64}$/)
    expect(w.args[1]).toBe(ENS_HINT_KEY)
    expect(w.args[2]).toBe(BEN)
  })
})

describe('fetchEnsHint', () => {
  it('reads the record through the client and compares', async () => {
    const calls: unknown[] = []
    const client = { getEnsText: async (a: { name: string; key: string }) => { calls.push(a); return BEN } }
    const h = await fetchEnsHint(client, 'Ben.ThurinLabs.eth', BEN)
    expect(h.state).toBe('match')
    expect(calls).toEqual([{ name: 'ben.thurinlabs.eth', key: 'id.thurin' }])
  })
})
