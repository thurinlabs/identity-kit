import { useBlockNumber, useEnsAddress, useEnsName } from 'wagmi'
import { identityErrorKind, needsRpcProbe, IDENTITY_ERROR_TEXT } from '../core/identityError'
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
  const { data: resolvedAddress, error: ensError, isFetched: ensFetched, refetch: refetchEns } = useEnsAddress({
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
    error: claimsError,
    refetch: refetchClaims,
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

  // An empty ENS result or a failed read might just be a dead RPC; ask it for the block
  // number before saying anything about the identity (core/identityError.ts).
  const lookup = { ensEmpty: !!ensInput && ensFetched && !resolvedAddress, ensFailed: !!ensError, claimsFailed: !!claimsError }
  const probeNeeded = needsRpcProbe(lookup)
  // useBlockNumber, not usePublicClient: the latter attaches every public action to the client,
  // which put ~360 KB more into the standalone embed (1.3.4). Own scope per identity and no
  // caching, so an earlier answer can't make a dead RPC look alive.
  const probe = useBlockNumber({
    chainId: chain.id,
    scopeKey: `thurin-rpc-probe:${ensOrAddress ?? ''}`,
    query: { enabled: probeNeeded, retry: 0, staleTime: 0, gcTime: 0 },
  })
  const rpcAnswered = !probeNeeded || probe.isFetching ? undefined : probe.isSuccess ? true : probe.isError ? false : undefined
  const errorKind = identityErrorKind({ ...lookup, rpcAnswered })
  const probing = probeNeeded && rpcAnswered === undefined
  const retry = () => {
    if (ensInput) refetchEns()
    refetchClaims()
    if (probeNeeded) probe.refetch()
  }

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
    // "Not finished" counts as loading, including queries paused in a background tab: the card
    // must not render defaults (zeros) for an identity it hasn't looked up yet.
    isLoading: (!!ensInput && !ensFetched) || claimsLoading || proofsLoading || efpLoading || probing,
    error: errorKind ? new Error(IDENTITY_ERROR_TEXT[errorKind]) : null,
    errorKind,
    retry,
  }
}
