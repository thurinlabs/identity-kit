import { useReadContract } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { REGISTRY_ABI, getRegistry } from '../core/contract'
import { chainFor } from '../provider'
import { useIdentityKitConfig } from '../context'
import { IDENTITY_KINDS, parseRecord, pickRecords, type ParsedRecord } from '../core/records'

/**
 * The records on one claim, read with `recordsOf` and parsed. `kinds` picks and orders them
 * (default: the kinds an identity page shows); `null` shows every record.
 */
export function useRecords(address: string | undefined | null, index: number | undefined | null, kinds: readonly string[] | null = IDENTITY_KINDS, armoredKey?: string | null) {
  const config = useIdentityKitConfig()
  const registry = getRegistry(config.network, config.registryAddress)
  const chain = chainFor(config.network)
  const owner = address as `0x${string}` | undefined
  const enabled = !!owner && index !== undefined && index !== null

  const { data: raw, isLoading: readLoading, refetch } = useReadContract({
    address: registry.address,
    abi: REGISTRY_ABI,
    functionName: 'recordsOf',
    args: enabled ? [owner!, BigInt(index!)] : undefined,
    chainId: chain.id,
    query: { enabled },
  })

  const picked = raw ? pickRecords(raw[0], raw[1], kinds) : []
  const { data: records, isLoading: parseLoading } = useQuery({
    queryKey: ['records', config.network, registry.address, address, index, kinds?.join(',') ?? '*', JSON.stringify(picked), armoredKey ?? ''],
    queryFn: async (): Promise<ParsedRecord[]> => {
      const out: ParsedRecord[] = []
      for (const r of picked) out.push(await parseRecord(r.kind, r.text, { armoredKey: armoredKey ?? undefined }))
      return out
    },
    enabled: enabled && raw !== undefined,
  })

  return { records: records ?? [], isLoading: enabled && (readLoading || parseLoading), refetch: () => { void refetch() } }
}
