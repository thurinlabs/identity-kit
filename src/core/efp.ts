import type { EFPGraph } from './types'

const EFP_API = 'https://api.ethfollow.xyz/api/v1'

/**
 * EFP social graph for an address. Followers are counted by EFP for any address,
 * whether or not it has published a list of its own; following and top-8 exist
 * only when it has (its "primary list"). An address with followers but no list
 * — a project account that has never followed anyone — is still on EFP.
 */
export async function fetchEFPGraph(address: string): Promise<EFPGraph | null> {
  try {
    const [statsResp, listsResp] = await Promise.all([
      fetch(`${EFP_API}/users/${address}/stats`),
      fetch(`${EFP_API}/users/${address}/lists`),
    ])
    if (!statsResp.ok && !listsResp.ok) return null

    const statsData = statsResp.ok ? await statsResp.json() : {}
    const listsData = listsResp.ok ? await listsResp.json() : {}
    const followers = parseInt(statsData.followers_count) || 0
    const listId = listsData.primary_list

    let following = 0
    let top8: string[] = []
    if (listId) {
      const [followingResp, top8Resp] = await Promise.all([
        fetch(`${EFP_API}/lists/${listId}/following?limit=100`),
        fetch(`${EFP_API}/lists/${listId}/following?limit=8&tags=top8`),
      ])
      const followingData = followingResp.ok ? await followingResp.json() : { following: [] }
      const top8Data = top8Resp.ok ? await top8Resp.json() : { following: [] }
      following = (followingData.following || []).length
      top8 = (top8Data.following || []).map((f: any) => f.data)
    }

    return { followers, following, top8, hasEfp: !!listId || followers > 0 }
  } catch {
    return null
  }
}
