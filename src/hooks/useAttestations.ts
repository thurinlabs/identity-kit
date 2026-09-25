import { useReadContract, useReadContracts } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { REGISTRY_ABI, getRegistry } from '../core/contract'
import { bytesToFingerprint } from '../core/fingerprint'
import { chainFor } from '../provider'
import { verifyAttestation, payloadText } from '../core/pgp'
import { useIdentityKitConfig } from '../context'
import type { Attestation } from '../core/types'

/**
 * On-chain attestations for an address, read straight from the v2 registry:
 * `attestationsOf` for the history, `getPayload` for each stored signature + key.
 * No event logs, so any RPC works. Each claim is verified off-chain.
 */
export function useAttestations(address: string | undefined | null) {
  const config = useIdentityKitConfig()
  const registry = getRegistry(config.network, config.registryAddress)
  const chain = chainFor(config.network)
  const owner = address as `0x${string}` | undefined

  const { data: rows, isLoading: rowsLoading, isFetched: rowsFetched, error: rowsError, refetch: refetchRows } = useReadContract({
    address: registry.address,
    abi: REGISTRY_ABI,
    functionName: 'attestationsOf',
    args: owner ? [owner] : undefined,
    chainId: chain.id,
    query: { enabled: !!owner },
  })

  const count = rows?.length ?? 0

  const contracts = owner && rows
    ? rows.map((_, i) => ({
        address: registry.address,
        abi: REGISTRY_ABI,
        functionName: 'getPayload' as const,
        args: [owner, BigInt(i)] as const,
        chainId: chain.id,
      }))
    : []

  const { data: payloads, isLoading: payloadsLoading, error: payloadsError, refetch: refetchPayloads } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  })

  const payloadsReady = count === 0 || (payloads !== undefined && payloads.length === count)

  const { data: claims, isLoading: verifyLoading } = useQuery({
    queryKey: ['attestations', config.network, registry.address, address, count, payloadsReady],
    queryFn: async (): Promise<Attestation[]> => {
      if (!rows || !address) return []
      const results: Attestation[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const payload = payloads?.[i]
        let pgpSignature: string | null = null
        let pgpPublicKey: string | null = null
        if (payload && payload.status === 'success') {
          const [sigHex, keyHex] = payload.result as readonly [`0x${string}`, `0x${string}`]
          // Older claims store armored text, lean claims raw bytes; both come back as armored text.
          pgpSignature = await payloadText(sigHex, 'signature')
          pgpPublicKey = await payloadText(keyHex, 'key')
        }

        const fingerprint = bytesToFingerprint(row.fingerprint)
        const verification = pgpPublicKey && pgpSignature
          ? await verifyAttestation({ pgpPublicKey, pgpSignature, fingerprint, ethAddress: address })
          : null

        const revokedAt = Number(row.revokedAt)
        results.push({
          index: i,
          fingerprint,
          createdAt: Number(row.createdAt),
          revoked: revokedAt !== 0,
          revokedAt: revokedAt === 0 ? null : revokedAt,
          messageVersion: Number(row.messageVersion),
          pgpSignature,
          pgpPublicKey,
          verification,
        })
      }
      return results
    },
    enabled: !!rows && payloadsReady,
    staleTime: 300_000,
  })

  // Not fetched yet counts as loading (a paused query in a background tab is not "no claims").
  const isLoading = rowsLoading || (!!owner && !rowsFetched) || payloadsLoading || verifyLoading || (!!owner && rows !== undefined && !payloadsReady)

  const activeClaims = (claims || []).filter((c) => !c.revoked)
  // The current identity is the latest claim that is both active and has a
  // verified signature binding the key to this address. A claim whose signature
  // has not verified must not surface the key's proofs or user data.
  const verifiedClaims = activeClaims.filter((c) => c.verification?.verified)
  const currentFingerprint = verifiedClaims.length > 0
    ? verifiedClaims[verifiedClaims.length - 1].fingerprint
    : null

  return {
    claims: claims || [],
    totalClaims: count,
    activeClaims: activeClaims.length,
    currentFingerprint,
    isLoading,
    /** A registry read failed (the RPC may be down; useThurinIdentity finds out which). */
    error: (rowsError ?? payloadsError ?? null) as Error | null,
    refetch: () => { if (owner) { refetchRows(); if (contracts.length > 0) refetchPayloads() } },
  }
}
