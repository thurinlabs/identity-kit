import { useEnsText } from 'wagmi'
import { normalize } from 'viem/ens'
import { useIdentityKitConfig } from '../context'
import { chainFor } from '../core/contract'
import { ENS_HINT_KEY, ensHintFor, type EnsHint } from '../core/ensHint'

function safeNormalize(name: string): string | undefined {
  try { return normalize(name) } catch { return undefined }
}

/**
 * A name's `id.thurin` record against the fingerprint the registry verifies for its
 * address. `state` is `match`, `unset`, or `mismatch`; the last one is the signal worth
 * showing — a name advertising a key its address has not claimed.
 */
export function useEnsHint(name: string | undefined | null, verifiedFingerprint: string | null | undefined): EnsHint & { isLoading: boolean; refetch: () => void } {
  const chain = chainFor(useIdentityKitConfig().network)
  const ensName = name ? safeNormalize(name) : undefined
  const { data, isLoading, refetch } = useEnsText({
    name: ensName,
    key: ENS_HINT_KEY,
    chainId: chain.id,
    query: { enabled: !!ensName },
  })
  return { ...ensHintFor(data ?? null, verifiedFingerprint), isLoading: !!ensName && isLoading, refetch: () => { void refetch() } }
}
