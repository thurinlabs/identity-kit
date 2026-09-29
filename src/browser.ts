/**
 * The browser bundle (`dist/thurin-check.js`): `ThurinCheck.checkKeyFor` for pages with no
 * build step. Same check as the kit's `checkKeyFor`, with its own client: the network's public
 * node unless `rpc` is given. That node sees which owner is looked up; pass your own to avoid it.
 */
import { createPublicClient, http } from 'viem'
import { checkKeyFor as check, type KeyCheck } from './core/checkKey'
import { chainFor, getRegistry } from './core/contract'
import type { PgpInput } from './core/pgp'

export type { KeyCheck, KeyCheckStatus } from './core/checkKey'

export function checkKeyFor(
  { key, owner, rpc, network = 'mainnet' }: { key: PgpInput; owner: string; rpc?: string; network?: 'mainnet' | 'sepolia' },
): Promise<KeyCheck> {
  if (network !== 'mainnet' && network !== 'sepolia') throw new Error(`Unknown network: ${network}`)
  const { address, defaultRpcUrl } = getRegistry(network)
  const client = createPublicClient({ chain: chainFor(network), transport: http(rpc ?? defaultRpcUrl), batch: { multicall: true } })
  return check(client, { key, owner, registry: address })
}
