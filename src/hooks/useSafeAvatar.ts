import { useEnsText, useReadContract } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { avatarUrl, parseNftAvatar, nftAvatarImage, NFT_AVATAR_ABI } from '../core/avatar'

/**
 * The avatar to show for a normalized ENS name, or null. Reads the raw `avatar` record and
 * loads only what `avatarUrl` allows (see core/avatar.ts); wagmi's useEnsAvatar would fetch
 * whatever host the name's owner chose.
 */
export function useSafeAvatar(name: string | undefined, chainId: number): string | null {
  const { data: raw } = useEnsText({ name, key: 'avatar', chainId, query: { enabled: !!name } })
  const direct = avatarUrl(raw)
  const nft = direct ? null : parseNftAvatar(raw)
  const { data: tokenUri } = useReadContract({
    address: nft?.contract,
    abi: NFT_AVATAR_ABI,
    functionName: nft?.standard === 'erc1155' ? 'uri' : 'tokenURI',
    args: nft ? [nft.tokenId] : undefined,
    chainId,
    query: { enabled: !!nft && nft.chainId === chainId },
  })
  const { data: image } = useQuery({
    queryKey: ['thurin-nft-avatar', tokenUri, nft?.tokenId.toString()],
    queryFn: () => nftAvatarImage(tokenUri as string, nft!.tokenId).catch(() => null),
    enabled: typeof tokenUri === 'string' && !!nft,
  })
  return direct ?? image ?? null
}
