// Provider
export { IdentityKitProvider } from './provider'
export type { IdentityKitProviderProps } from './provider'

// Components
export { ScryCard } from './components/ScryCard/ScryCard'
export type { ScryCardProps } from './components/ScryCard/ScryCard'

// Hooks
export { useScryIdentity } from './hooks/useScryIdentity'
export { useSignetClaims } from './hooks/useSignetClaims'
export { useEFPGraph } from './hooks/useEFPGraph'
export { usePGPProofs } from './hooks/usePGPProofs'

// Core utilities
export { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref } from './core/proofs'
export { parsePgpKey, verifyAttestation, fetchKeyByFingerprint, fetchKeyByKeyId } from './core/pgp'
export { fetchEFPGraph } from './core/efp'

// Types
export type {
  ScryIdentity,
  SignetClaim,
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
