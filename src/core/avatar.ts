/**
 * ENS avatars without the tracking pixel. The `avatar` record is a link the name's owner
 * chooses; loading an ordinary https:// link would tell that owner's server the IP and time of
 * everyone who views the card. So only images the owner can't watch load: content-addressed
 * ones (IPFS, Arweave, inline data, or an NFT whose metadata and image are content-addressed)
 * through one public gateway, and euc.li, ENS Labs' host behind the ENS app's avatar upload
 * (most avatars; ENS Labs sees the view, the name's owner doesn't). Anything else: no avatar.
 */

export const IPFS_GATEWAY = 'https://ipfs.io/ipfs/'
export const ARWEAVE_GATEWAY = 'https://arweave.net/'

/** An image URL safe to load for `uri`, or null if loading it would reach a host the owner picked. */
export function avatarUrl(uri: unknown): string | null {
  if (typeof uri !== 'string') return null
  const u = uri.trim()
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(u)) return u
  let m = u.match(/^ipfs:\/\/(?:ipfs\/)?([a-zA-Z0-9]{46,}(?:\/[^?#\s]*)?)$/)
  if (m) return IPFS_GATEWAY + m[1]
  m = u.match(/^ar:\/\/([a-zA-Z0-9_-]{43}(?:\/[^?#\s]*)?)$/)
  if (m) return ARWEAVE_GATEWAY + m[1]
  if (/^https:\/\/euc\.li\/[^?#\s]+$/.test(u)) return u
  // A gateway link someone pasted (https://any-gateway/ipfs/<cid>/…): same content, our gateway.
  m = u.match(/^https:\/\/[^/]+\/ipfs\/([a-zA-Z0-9]{46,}(?:\/[^?#\s]*)?)$/)
  if (m) return IPFS_GATEWAY + m[1]
  return null
}

export interface NftAvatar { chainId: number; standard: 'erc721' | 'erc1155'; contract: `0x${string}`; tokenId: bigint }

/** `eip155:1/erc721:0x…/123` (or erc1155) → its parts; null for anything else. */
export function parseNftAvatar(raw: unknown): NftAvatar | null {
  const m = typeof raw === 'string' && raw.trim().match(/^eip155:(\d+)\/(erc721|erc1155):(0x[0-9a-fA-F]{40})\/(\d+)$/)
  return m ? { chainId: Number(m[1]), standard: m[2] as NftAvatar['standard'], contract: m[3] as `0x${string}`, tokenId: BigInt(m[4]) } : null
}

export const NFT_AVATAR_ABI = [
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'uri', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
] as const

/**
 * The image for an NFT avatar, given the token's metadata URI (from `tokenURI` / `uri`).
 * The metadata must be inline JSON or content-addressed, and so must its image.
 */
export async function nftAvatarImage(tokenUri: string, tokenId: bigint, fetchFn: typeof fetch = fetch): Promise<string | null> {
  // ERC-1155 metadata URIs carry an {id} placeholder: 64 hex chars, lowercase, no 0x.
  const uri = tokenUri.replace('{id}', tokenId.toString(16).padStart(64, '0'))
  let meta: any
  const inline = uri.match(/^data:application\/json(;base64)?,([\s\S]*)$/)
  if (inline) meta = JSON.parse(inline[1] ? atob(inline[2]) : decodeURIComponent(inline[2]))
  else {
    const url = uri.startsWith('data:') ? null : avatarUrl(uri)
    if (!url) return null
    const res = await fetchFn(url)
    if (!res.ok) return null
    meta = await res.json()
  }
  return avatarUrl(meta?.image ?? meta?.image_url)
}
