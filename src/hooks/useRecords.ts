import { useReadContracts } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { REGISTRY_ABI, getRegistry } from '../core/contract'
import { chainFor } from '../provider'
import { useIdentityKitConfig } from '../context'
import { IDENTITY_KINDS, decodeRecord, parseRecord, recordKind, type ParsedRecord } from '../core/records'

/**
 * The records on one claim, for the kinds given (default: the kinds an identity page shows),
 * read in one multicall and parsed. Kinds with no record are left out.
 */
export function useRecords(address: string | undefined | null, index: number | undefined | null, kinds: readonly string[] = IDENTITY_KINDS) {
  const config = useIdentityKitConfig()
  const registry = getRegistry(config.network, config.registryAddress)
  const chain = chainFor(config.network)
  const owner = address as `0x${string}` | undefined
  const enabled = !!owner && index !== undefined && index !== null

  const contracts = enabled
    ? kinds.map(kind => ({ address: registry.address, abi: REGISTRY_ABI, functionName: 'record' as const, args: [owner!, BigInt(index!), recordKind(kind)] as const, chainId: chain.id }))
    : []
  const { data: raw, isLoading: readLoading, refetch } = useReadContracts({ contracts, query: { enabled: contracts.length > 0 } })

  const texts = (raw ?? []).map(r => (r.status === 'success' ? decodeRecord(r.result as `0x${string}`) : ''))
  const { data: records, isLoading: parseLoading } = useQuery({
    queryKey: ['records', config.network, registry.address, address, index, kinds.join(','), texts.join(' ')],
    queryFn: async (): Promise<ParsedRecord[]> => {
      const out: ParsedRecord[] = []
      for (let i = 0; i < kinds.length; i++) if (texts[i]) out.push(await parseRecord(kinds[i], texts[i]))
      return out
    },
    enabled: enabled && raw !== undefined,
  })

  return { records: records ?? [], isLoading: enabled && (readLoading || parseLoading), refetch: () => { void refetch() } }
}
