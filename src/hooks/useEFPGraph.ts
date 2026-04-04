import { useQuery } from '@tanstack/react-query'
import { fetchEFPGraph } from '../core/efp'
import type { EFPGraph } from '../core/types'

export function useEFPGraph(address: string | undefined | null) {
  const { data, isLoading } = useQuery<EFPGraph | null>({
    queryKey: ['efp-graph', address],
    queryFn: () => fetchEFPGraph(address!),
    enabled: !!address,
    staleTime: 300_000,
  })

  return {
    efp: data ?? null,
    isLoading,
  }
}
