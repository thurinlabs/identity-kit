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
export { useEnsHint } from './hooks/useEnsHint'

// Core utilities
export { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref } from './core/proofs'
export { parsePgpKey, verifyAttestation, stripEmailUserIDs, hasEmailUserID } from './core/pgp'
export type { StrippedKey } from './core/pgp'
export { fetchEFPGraph } from './core/efp'
export {
  normalizeFingerprint, fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes,
} from './core/fingerprint'
export {
  EIP712_NAME, EIP712_VERSION, AUTHORIZATION_TYPES, registryDomain,
  attestTypedData, reattestTypedData, updateKeyTypedData, revokeTypedData, setRecordTypedData,
  authorizationDigest, recordKind,
} from './core/authorization'
export type {
  AuthorizationAction, AttestAuthorization, ReattestAuthorization, UpdateKeyAuthorization,
  RevokeAuthorization, SetRecordAuthorization,
} from './core/authorization'

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
export { REGISTRY_ADDRESS, REGISTRY_ABI, NETWORKS, getRegistry, isNetworkName } from './core/contract'
export { ENS_HINT_KEY, ENS_TEXT_RESOLVER_ABI, ensHintFor, ensHintValue, ensHintWrite, fetchEnsHint } from './core/ensHint'
export type { EnsHint, EnsHintState, EnsTextReader } from './core/ensHint'
export type { NetworkName, RegistryDeployment } from './core/contract'
export { chainFor } from './core/contract'
