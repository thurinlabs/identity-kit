import { useQuery } from '@tanstack/react-query'
import { fetchKeyByFingerprint, parsePgpKey } from '../core/pgp'
import { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref } from '../core/proofs'
import { useIdentityKitConfig } from '../context'
import type { PGPKeyInfo, ProofResult } from '../core/types'

export function usePGPProofs(fingerprint: string | undefined | null) {
  const config = useIdentityKitConfig()

  const { data } = useQuery({
    queryKey: ['pgp-proofs', fingerprint],
    queryFn: async (): Promise<{ keyInfo: PGPKeyInfo | null; proofs: ProofResult[] }> => {
      if (!fingerprint) return { keyInfo: null, proofs: [] }

      const armoredKey = await fetchKeyByFingerprint(fingerprint)
      if (!armoredKey) return { keyInfo: null, proofs: [] }

      const keyInfo = await parsePgpKey(armoredKey)
      if (!keyInfo) return { keyInfo: null, proofs: [] }

      // Identify proofs from notations. Drop unrecognized targets (provider
      // 'unknown') so the card doesn't render "Unknown" badges for platforms
      // Thurin has no verifier for — matching the explorer's behavior.
      const identified = keyInfo.notations
        .map((n) => identifyProof(n))
        .filter((p): p is NonNullable<typeof p> => p !== null && p.provider !== 'unknown')

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

      // Collapse proofs that resolve to the same account — the same target is
      // often listed under both proof@thurin.id and proof@ariadne.id (and can
      // be reached via more than one proof URL). Key by provider + display
      // identity, preferring a verified result.
      const byAccount = new Map<string, ProofResult>()
      for (const p of proofs) {
        const key = `${p.provider}:${p.displayUrl}`
        const prev = byAccount.get(key)
        if (!prev || (p.status === 'verified' && prev.status !== 'verified')) {
          byAccount.set(key, p)
        }
      }

      return { keyInfo, proofs: [...byAccount.values()] }
    },
    enabled: !!fingerprint,
    staleTime: 300_000,
  })

  return {
    keyInfo: data?.keyInfo ?? null,
    proofs: data?.proofs ?? [],
    // Report loading whenever a fingerprint is set but its proofs haven't
    // resolved yet. Using react-query's own isLoading leaves a gap while the
    // query is enabling (fingerprint just became known), during which the card
    // would briefly paint without proof badges and then pop them in.
    isLoading: !!fingerprint && data === undefined,
  }
}
