// Provider
export { IdentityKitProvider } from './provider'
export type { IdentityKitProviderProps } from './provider'

// Hooks
export { useThurinIdentity } from './hooks/useThurinIdentity'
export { useAttestations } from './hooks/useAttestations'
export { usePGPProofs } from './hooks/usePGPProofs'
export { useEnsHint } from './hooks/useEnsHint'
export { useRecords } from './hooks/useRecords'
export { useSafeAvatar } from './hooks/useSafeAvatar'

// Core utilities
export { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref, FARCASTER_HUB } from './core/proofs'
export type { ProofOptions } from './core/proofs'
export { parsePgpKey, verifyAttestation, verifyClearsigned, stripEmailUserIDs, hasEmailUserID, verifyStatementSignature, statementText, leanKey, claimSignature, signatureEmail, payloadText } from './core/pgp'
export type { StrippedKey, LeanKey, PgpInput } from './core/pgp'
export { identityErrorKind, needsRpcProbe, IDENTITY_ERROR_TEXT } from './core/identityError'
export { CLAIM_CHECK_LABEL, claimCheckText, formatClaimDate, expiresSoon, expiresSoonText, claimFates, claimFateText } from './core/claimStatus'
export type { ClaimCheckText, ClaimFate } from './core/claimStatus'
export type { IdentityErrorKind, IdentityLookupState } from './core/identityError'
export { avatarUrl, avatarFallbacks, parseNftAvatar, nftAvatarImage, NFT_AVATAR_ABI, IPFS_GATEWAY, IPFS_GATEWAYS, ARWEAVE_GATEWAY } from './core/avatar'
export type { NftAvatar } from './core/avatar'
export {
  normalizeFingerprint, fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes,
} from './core/fingerprint'
export {
  EIP712_NAME, EIP712_VERSION, AUTHORIZATION_TYPES, registryDomain,
  attestTypedData, reattestTypedData, updateKeyTypedData, revokeTypedData, setRecordTypedData, markCompromisedTypedData,
  authorizationDigest, recordKind, REVOKE_REASONS, OWNER_REVOKE_REASONS,
} from './core/authorization'
export type {
  AuthorizationAction, AttestAuthorization, ReattestAuthorization, UpdateKeyAuthorization,
  RevokeAuthorization, SetRecordAuthorization, MarkCompromisedAuthorization, RevokeReason,
} from './core/authorization'

// Types
export type {
  ThurinIdentity,
  Attestation,
  PGPVerification,
  ClaimCheckKind,
  PGPKeyInfo,
  SubkeyInfo,
  Notation,
  Proof,
  ProofResult,
  IdentityKitConfig,
} from './core/types'

// Constants
export { REGISTRY_ADDRESS, REGISTRY_ABI, NETWORKS, getRegistry, isNetworkName } from './core/contract'
export {
  MAX_RECORD_BYTES, MAX_KIND_BYTES, KNOWN_KINDS, kindName, checkKindName, checkRecordValue, pickRecords, pageRecords,
  parseReleases, addRelease, renderReleases, parseRecord, fetchRecords,
} from './core/records'
export type { KnownKind, ParsedRecord, RecordData, ReleaseEntry, ReleasesRecord, RecordReader } from './core/records'
export { ENS_HINT_KEY, ENS_TEXT_RESOLVER_ABI, ensHintFor, ensHintValue, ensHintWrite, fetchEnsHint } from './core/ensHint'
export type { EnsHint, EnsHintState, EnsTextReader } from './core/ensHint'
export type { NetworkName, RegistryDeployment } from './core/contract'
export { chainFor } from './core/contract'
