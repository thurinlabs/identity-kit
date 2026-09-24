// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { avatarUrl, parseNftAvatar, nftAvatarImage, IPFS_GATEWAY } from '../avatar'

const CID = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'

describe('avatarUrl: only images the name owner cannot watch', () => {
  it('loads content-addressed and ENS-app avatars', () => {
    expect(avatarUrl(`ipfs://${CID}`)).toBe(IPFS_GATEWAY + CID)
    expect(avatarUrl(`ipfs://ipfs/${CID}/a.png`)).toBe(`${IPFS_GATEWAY}${CID}/a.png`)
    expect(avatarUrl(`https://gateway.pinata.cloud/ipfs/${CID}`)).toBe(IPFS_GATEWAY + CID)   // rerouted to our gateway
    expect(avatarUrl('ar://abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ')).toBe('https://arweave.net/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ')
    expect(avatarUrl('data:image/png;base64,iVBORw0')).toBe('data:image/png;base64,iVBORw0')
    expect(avatarUrl('https://euc.li/vitalik.eth')).toBe('https://euc.li/vitalik.eth')
  })
  it('refuses hosts the owner picked, and anything that is not an image link', () => {
    for (const bad of ['https://tracker.example/me.png', 'http://euc.li/x', 'https://euc.li.evil.example/x', 'javascript:alert(1)', 'data:text/html,<script>', '', null, 42]) {
      expect(avatarUrl(bad)).toBeNull()
    }
  })
})

describe('NFT avatars', () => {
  it('parses eip155 references', () => {
    expect(parseNftAvatar('eip155:1/erc721:0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB/1')).toEqual({
      chainId: 1, standard: 'erc721', contract: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB', tokenId: 1n,
    })
    expect(parseNftAvatar('https://example.com/nft')).toBeNull()
  })
  it('takes the image from inline metadata, only if content-addressed', async () => {
    const meta = (image: string) => 'data:application/json;base64,' + btoa(JSON.stringify({ image }))
    expect(await nftAvatarImage(meta(`ipfs://${CID}`), 1n)).toBe(IPFS_GATEWAY + CID)
    expect(await nftAvatarImage(meta('https://tracker.example/x.png'), 1n)).toBeNull()
  })
  it('fetches metadata only from a content-addressed URI, filling the ERC-1155 {id}', async () => {
    const seen: string[] = []
    const fake = (async (url: string) => { seen.push(url); return { ok: true, json: async () => ({ image: `ipfs://${CID}` }) } }) as any
    expect(await nftAvatarImage(`ipfs://${CID}/{id}.json`, 255n, fake)).toBe(IPFS_GATEWAY + CID)
    expect(seen[0]).toBe(`${IPFS_GATEWAY}${CID}/${'0'.repeat(62)}ff.json`)
    expect(await nftAvatarImage('https://api.example.com/meta/1', 1n, fake)).toBeNull()
    expect(seen).toHaveLength(1)
  })
})
