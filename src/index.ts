// Provider
export { IdentityKitProvider } from './provider'
export type { IdentityKitProviderProps } from './provider'

// Components
export { ThurinCard } from './components/ThurinCard/ThurinCard'
export type { ThurinCardProps } from './components/ThurinCard/ThurinCard'

// Hooks
export { useThurinIdentity } from './hooks/useThurinIdentity'
export { useAttestations } from './hooks/useAttestations'
export { useEFPGraph } from './hooks/useEFPGraph'
export { usePGPProofs } from './hooks/usePGPProofs'

// Core utilities
export { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref } from './core/proofs'
export { parsePgpKey, verifyAttestation, fetchKeyByFingerprint, fetchKeyByKeyId } from './core/pgp'
export { fetchEFPGraph } from './core/efp'

// Types
export type {
  ThurinIdentity,
  Attestation,
  PGPVerification,
  PGPKeyInfo,
  SubkeyInfo,
  Notation,
  Proof,
  ProofResult,
  EFPGraph,
  Theme,
  IdentityKitConfig,
} from './core/types'

// Constants
export { REGISTRY_ADDRESS, REGISTRY_ABI, CONTRACT_DEPLOY_BLOCK } from './core/contract'
