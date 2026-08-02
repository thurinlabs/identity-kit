import { useReadContract, useReadContracts } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { useQuery } from '@tanstack/react-query'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { REGISTRY_ADDRESS, REGISTRY_ABI, CONTRACT_DEPLOY_BLOCK } from '../core/contract'
import { getLogsChunked } from '../core/logs'
import { verifyAttestation } from '../core/pgp'
import { useIdentityKitConfig } from '../context'
import type { SignetClaim } from '../core/types'

export function useSignetClaims(address: string | undefined | null) {
  const config = useIdentityKitConfig()

  const { data: count, isLoading: countLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'attestationCount',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: mainnet.id,
    query: { enabled: !!address },
  })

  const attestationCount = count ? Number(count) : 0

  const contracts = address
    ? Array.from({ length: attestationCount }, (_, i) => ({
        address: REGISTRY_ADDRESS as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'getAttestation' as const,
        args: [address as `0x${string}`, BigInt(i)] as const,
        chainId: mainnet.id,
      }))
    : []

  const { data: attestations, isLoading: attestationsLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  })

  // Fetch event logs for PGP data (signature + public key not available from contract reads)
  const { data: eventData } = useQuery({
    queryKey: ['signet-logs', address],
    queryFn: async () => {
      if (!address) return []
      const client = createPublicClient({
        chain: mainnet,
        transport: http(config.rpcUrl || 'https://ethereum-rpc.publicnode.com'),
      })
      const event = parseAbiItem(
        'event Attested(address indexed ethAddress, string indexed fingerprintHash, string fingerprint, string pgpSignature, string pgpPublicKey, uint256 index, uint256 timestamp)',
      )
      return getLogsChunked(client, {
        address: REGISTRY_ADDRESS,
        event,
        args: { ethAddress: address as `0x${string}` },
        fromBlock: CONTRACT_DEPLOY_BLOCK,
        toBlock: 'latest',
      })
    },
    enabled: !!address && attestationCount > 0,
    staleTime: 300_000,
  })

  // Combine attestation data with event log data and verify
  const { data: claims, isLoading: verifyLoading } = useQuery({
    queryKey: ['signet-claims', address, attestationCount, !!eventData],
    queryFn: async (): Promise<SignetClaim[]> => {
      if (!attestations || !address) return []

      const results: SignetClaim[] = []

      // Match each event log to its attestation by the on-chain index it
      // carries. The log array is block-ordered, not attestation-indexed, so
      // positional access can pair the wrong PGP signature/key with a claim,
      // which then fails verification.
      const logsByIndex: Record<number, any> = {}
      for (const l of eventData || []) logsByIndex[Number(l.args.index)] = l

      for (let i = 0; i < attestations.length; i++) {
        const att = attestations[i]
        if (att.status !== 'success') continue

        const [fingerprint, createdAt, revoked] = att.result as [string, bigint, boolean]
        const log = logsByIndex[i]

        const pgpSignature = log?.args?.pgpSignature ?? null
        const pgpPublicKey = log?.args?.pgpPublicKey ?? null
        const txHash = log?.transactionHash ?? null

        let verification = null
        if (pgpPublicKey && pgpSignature) {
          verification = await verifyAttestation({
            pgpPublicKey,
            pgpSignature,
            fingerprint,
            ethAddress: address,
          })
        }

        results.push({
          index: i,
          fingerprint,
          createdAt: Number(createdAt),
          revoked,
          pgpSignature,
          pgpPublicKey,
          txHash,
          verification,
        })
      }

      return results
    },
    enabled: !!attestations && attestations.length > 0,
    staleTime: 300_000,
  })

  const isLoading = countLoading || attestationsLoading || verifyLoading

  const activeClaims = (claims || []).filter((c) => !c.revoked)
  // The current identity is the latest claim that is both non-revoked and has
  // a verified signature binding the key to this address. A claim whose
  // signature has not verified must not surface the key's proofs or user data.
  const verifiedClaims = activeClaims.filter((c) => c.verification?.verified)
  const currentFingerprint = verifiedClaims.length > 0
    ? verifiedClaims[verifiedClaims.length - 1].fingerprint
    : null

  return {
    claims: claims || [],
    totalClaims: attestationCount,
    activeClaims: activeClaims.length,
    currentFingerprint,
    isLoading,
  }
}
