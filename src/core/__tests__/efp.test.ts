import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEFPGraph } from '../efp'

describe('fetchEFPGraph', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when user has no lists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ primary_list: null }),
    } as Response)

    const result = await fetchEFPGraph('0x1234')
    expect(result).toBeNull()
  })

  it('returns null when lists endpoint fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
    } as Response)

    const result = await fetchEFPGraph('0x1234')
    expect(result).toBeNull()
  })

  it('returns graph data for valid user', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    // lists endpoint
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ primary_list: '42' }),
    } as Response)

    // following, stats, top8 (parallel)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ following: [{ data: '0xA' }, { data: '0xB' }] }),
    } as Response)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ followers_count: '100' }),
    } as Response)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ following: [{ data: '0xC' }] }),
    } as Response)

    const result = await fetchEFPGraph('0x1234')
    expect(result).toEqual({
      followers: 100,
      following: 2,
      top8: ['0xC'],
      hasEfp: true,
    })
  })

  it('handles network errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

    const result = await fetchEFPGraph('0x1234')
    expect(result).toBeNull()
  })
})
