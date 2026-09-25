/**
 * ENS avatars without the tracking pixel: an ordinary https:// avatar tells the name's owner who
 * viewed the page. Only images the owner can't watch load: content-addressed ones (IPFS, Arweave,
 * inline data, an NFT whose metadata and image are content-addressed) through public gateways, and
 * euc.li, where the ENS app stores uploads (ENS Labs sees the view; the owner doesn't).
 */

/** Public IPFS gateways, tried in order when an image fails: any one can stop serving. Each sees the viewer's IP. */
export const IPFS_GATEWAYS = ['https://ipfs.filebase.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/'] as const
/** The first gateway in IPFS_GATEWAYS. */
export const IPFS_GATEWAY: string = IPFS_GATEWAYS[0]
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

/** The same content through the other IPFS gateways, for retrying a failed load. [] for non-IPFS URLs. */
export function avatarFallbacks(url: string | null | undefined): string[] {
  if (!url || !url.startsWith(IPFS_GATEWAYS[0])) return []
  const path = url.slice(IPFS_GATEWAYS[0].length)
  return IPFS_GATEWAYS.slice(1).map((g) => g + path)
}

export interface NftAvatar { chainId: number; standard: 'erc721' | 'erc1155'; contract: `0x${string}`; tokenId: bigint }

/** `eip155:1/erc721:0x…/123` (or erc1155; any case, as records in the wild vary) → its parts; null otherwise. */
export function parseNftAvatar(raw: unknown): NftAvatar | null {
  const m = typeof raw === 'string' && raw.trim().match(/^eip155:(\d+)\/(erc721|erc1155):(0x[0-9a-fA-F]{40})\/(\d+)$/i)
  return m ? { chainId: Number(m[1]), standard: m[2].toLowerCase() as NftAvatar['standard'], contract: m[3] as `0x${string}`, tokenId: BigInt(m[4]) } : null
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
    for (const candidate of [url, ...avatarFallbacks(url)]) {
      try {
        const res = await fetchFn(candidate)
        if (res.ok) { meta = await res.json(); break }
      } catch { /* try the next gateway */ }
    }
    if (!meta) return null
  }
  return avatarUrl(meta?.image ?? meta?.image_url)
}
