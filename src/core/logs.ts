import { type PublicClient } from 'viem'
import { CONTRACT_DEPLOY_BLOCK } from './contract'

const LOG_CHUNK_SIZE = 49999n

export async function getLogsChunked(
  client: PublicClient,
  params: {
    address?: `0x${string}`
    event?: any
    args?: Record<string, any>
    fromBlock?: bigint
    toBlock?: bigint | 'latest'
  },
) {
  const latest = await client.getBlockNumber()
  const fromBlock = params.fromBlock ?? CONTRACT_DEPLOY_BLOCK
  const toBlock = params.toBlock === 'latest' || !params.toBlock ? latest : params.toBlock

  const allLogs: any[] = []

  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = start + LOG_CHUNK_SIZE - 1n > toBlock ? toBlock : start + LOG_CHUNK_SIZE - 1n
    const logs = await client.getLogs({
      ...params,
      fromBlock: start,
      toBlock: end,
    })
    allLogs.push(...logs)
  }

  return allLogs
}
