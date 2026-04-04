import { useEnsAddress, useEnsName, useEnsAvatar } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { normalize } from 'viem/ens'
import { useSignetClaims } from './useSignetClaims'
import { useEFPGraph } from './useEFPGraph'
import { usePGPProofs } from './usePGPProofs'
import type { ScryIdentity } from '../core/types'

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

function safeNormalize(name: string): string | undefined {
  try {
    return normalize(name)
  } catch {
    return undefined
  }
}

export function useScryIdentity(ensOrAddress: string | undefined | null): ScryIdentity {
  const isAddr = ensOrAddress ? isAddress(ensOrAddress) : false
  const ensInput = ensOrAddress && !isAddr ? safeNormalize(ensOrAddress) : undefined

  // Resolve ENS → address
  const { data: resolvedAddress } = useEnsAddress({
    name: ensInput,
    chainId: mainnet.id,
    query: { enabled: !!ensInput },
  })

  const address = isAddr ? ensOrAddress! : resolvedAddress ?? null

  // Reverse resolve address → ENS
  const { data: ensName } = useEnsName({
    address: address as `0x${string}` | undefined,
    chainId: mainnet.id,
    query: { enabled: !!address },
  })

  const displayName = ensInput || ensName || null

  const { data: ensAvatar } = useEnsAvatar({
    name: displayName ? safeNormalize(displayName) : undefined,
    chainId: mainnet.id,
    query: { enabled: !!displayName },
  })

  // Signet claims
  const {
    claims,
    totalClaims,
    activeClaims,
    currentFingerprint,
    isLoading: claimsLoading,
  } = useSignetClaims(address)

  // PGP proofs (from current fingerprint)
  const {
    keyInfo: pgpKeyInfo,
    proofs,
    isLoading: proofsLoading,
  } = usePGPProofs(currentFingerprint)

  // EFP social graph
  const { efp, isLoading: efpLoading } = useEFPGraph(address)

  return {
    address,
    ensName: displayName,
    ensAvatar: ensAvatar ?? null,
    claims,
    totalClaims,
    activeClaims,
    currentFingerprint,
    pgpKeyInfo,
    proofs,
    efp,
    isLoading: claimsLoading || proofsLoading || efpLoading,
    error: null,
  }
}
