import { useEnsAddress, useEnsName } from 'wagmi'
import { useIdentityKitConfig } from '../context'
import { chainFor } from '../provider'
import { normalize } from 'viem/ens'
import { useAttestations } from './useAttestations'
import { useEFPGraph } from './useEFPGraph'
import { usePGPProofs } from './usePGPProofs'
import { useSafeAvatar } from './useSafeAvatar'
import type { ThurinIdentity } from '../core/types'

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

export function useThurinIdentity(ensOrAddress: string | undefined | null): ThurinIdentity {
  const chain = chainFor(useIdentityKitConfig().network)
  const isAddr = ensOrAddress ? isAddress(ensOrAddress) : false
  const ensInput = ensOrAddress && !isAddr ? safeNormalize(ensOrAddress) : undefined

  // Resolve ENS → address
  const { data: resolvedAddress } = useEnsAddress({
    name: ensInput,
    chainId: chain.id,
    query: { enabled: !!ensInput },
  })

  const address = isAddr ? ensOrAddress! : resolvedAddress ?? null

  // Reverse resolve address → ENS
  const { data: ensName } = useEnsName({
    address: address as `0x${string}` | undefined,
    chainId: chain.id,
    query: { enabled: !!address },
  })

  const displayName = ensInput || ensName || null

  const ensAvatar = useSafeAvatar(displayName ? safeNormalize(displayName) : undefined, chain.id)

  // On-chain attestations
  const {
    claims,
    totalClaims,
    activeClaims,
    currentFingerprint,
    isLoading: claimsLoading,
  } = useAttestations(address)

  // PGP proofs come from the key stored in the current attestation — the
  // latest claim that is active and whose signature verified (the same rule
  // useAttestations uses to pick currentFingerprint).
  const currentClaim = [...claims].reverse().find(
    (c) => !c.revoked && c.verification?.verified && c.fingerprint === currentFingerprint,
  )
  const {
    keyInfo: pgpKeyInfo,
    proofs,
    isLoading: proofsLoading,
  } = usePGPProofs(currentFingerprint, currentClaim?.pgpPublicKey ?? null)

  // EFP social graph
  const { efp, isLoading: efpLoading } = useEFPGraph(address)

  return {
    address,
    ensName: displayName,
    ensAvatar,
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
