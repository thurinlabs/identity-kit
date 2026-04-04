import { useQuery } from '@tanstack/react-query'
import { fetchKeyByFingerprint, parsePgpKey } from '../core/pgp'
import { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref } from '../core/proofs'
import { useIdentityKitConfig } from '../context'
import type { PGPKeyInfo, ProofResult } from '../core/types'

export function usePGPProofs(fingerprint: string | undefined | null) {
  const config = useIdentityKitConfig()

  const { data, isLoading } = useQuery({
    queryKey: ['pgp-proofs', fingerprint],
    queryFn: async (): Promise<{ keyInfo: PGPKeyInfo | null; proofs: ProofResult[] }> => {
      if (!fingerprint) return { keyInfo: null, proofs: [] }

      const armoredKey = await fetchKeyByFingerprint(fingerprint)
      if (!armoredKey) return { keyInfo: null, proofs: [] }

      const keyInfo = await parsePgpKey(armoredKey)
      if (!keyInfo) return { keyInfo: null, proofs: [] }

      // Identify proofs from notations
      const identified = keyInfo.notations
        .map((n) => identifyProof(n))
        .filter((p): p is NonNullable<typeof p> => p !== null)

      // Verify all proofs in parallel
      const proofs: ProofResult[] = await Promise.all(
        identified.map(async (proof) => {
          const result = await verifyProof(proof, fingerprint, config.neynarApiKey)
          return {
            provider: proof.provider,
            label: proof.label,
            url: proof.url,
            displayUrl: displayUrl(proof),
            href: proofHref(proof),
            secondaryHref: proofSecondaryHref(proof),
            status: result.verified ? 'verified' as const : 'unverified' as const,
            reason: result.reason,
          }
        }),
      )

      return { keyInfo, proofs }
    },
    enabled: !!fingerprint,
    staleTime: 300_000,
  })

  return {
    keyInfo: data?.keyInfo ?? null,
    proofs: data?.proofs ?? [],
    isLoading,
  }
}
