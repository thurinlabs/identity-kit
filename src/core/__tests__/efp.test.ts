import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEFPGraph } from '../efp'

// Mock fetch by URL so the order of requests inside fetchEFPGraph does not matter.
function mockEfp(routes: Record<string, { ok: boolean; body?: unknown }>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    const match = Object.entries(routes).filter(([k]) => url.includes(k)).sort((a, b) => b[0].length - a[0].length)[0]
    if (!match) return { ok: false } as Response
    const [, r] = match
    return { ok: r.ok, json: async () => r.body } as Response
  })
}

describe('fetchEFPGraph', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('counts followers for an address that has no list of its own', async () => {
    // thurinlabs.eth on 2026-09-19: two followers, never followed anyone, no primary list.
    mockEfp({
      '/stats': { ok: true, body: { followers_count: '2', following_count: '0' } },
      '/lists': { ok: true, body: { primary_list: null, lists: [] } },
    })
    expect(await fetchEFPGraph('0x539c')).toEqual({ followers: 2, following: 0, top8: [], hasEfp: true })
  })

  it('reports no EFP presence for an address with no list and no followers', async () => {
    mockEfp({
      '/stats': { ok: true, body: { followers_count: '0', following_count: '0' } },
      '/lists': { ok: true, body: { primary_list: null, lists: [] } },
    })
    expect(await fetchEFPGraph('0x0000')).toEqual({ followers: 0, following: 0, top8: [], hasEfp: false })
  })

  it('returns null when both stats and lists endpoints fail', async () => {
    mockEfp({ '/stats': { ok: false }, '/lists': { ok: false } })
    expect(await fetchEFPGraph('0x1234')).toBeNull()
  })

  it('returns following and top8 for an address with a primary list', async () => {
    mockEfp({
      '/stats': { ok: true, body: { followers_count: '100' } },
      '/lists': { ok: true, body: { primary_list: '42' } },
      'tags=top8': { ok: true, body: { following: [{ data: '0xC' }] } },
      '/lists/42/following?limit=100': { ok: true, body: { following: [{ data: '0xA' }, { data: '0xB' }] } },
    })
    expect(await fetchEFPGraph('0x1234')).toEqual({ followers: 100, following: 2, top8: ['0xC'], hasEfp: true })
  })

  it('handles network errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))
    expect(await fetchEFPGraph('0x1234')).toBeNull()
  })
})
