import type { EFPGraph } from './types'

const EFP_API = 'https://api.ethfollow.xyz/api/v1'

export async function fetchEFPGraph(address: string): Promise<EFPGraph | null> {
  try {
    const listsResp = await fetch(`${EFP_API}/users/${address}/lists`)
    if (!listsResp.ok) return null
    const listsData = await listsResp.json()
    const listId = listsData.primary_list
    if (!listId) return null

    const [followingResp, statsResp, top8Resp] = await Promise.all([
      fetch(`${EFP_API}/lists/${listId}/following?limit=100`),
      fetch(`${EFP_API}/users/${address}/stats`),
      fetch(`${EFP_API}/lists/${listId}/following?limit=8&tags=top8`),
    ])

    const followingData = followingResp.ok ? await followingResp.json() : { following: [] }
    const statsData = statsResp.ok ? await statsResp.json() : {}
    const top8Data = top8Resp.ok ? await top8Resp.json() : { following: [] }

    return {
      followers: parseInt(statsData.followers_count) || 0,
      following: (followingData.following || []).length,
      top8: (top8Data.following || []).map((f: any) => f.data),
      hasEfp: true,
    }
  } catch {
    return null
  }
}
