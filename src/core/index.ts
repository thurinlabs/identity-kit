/**
 * @thurinlabs/identity-kit/core — the verification and data layer with no React,
 * wagmi, or DOM dependency. This is what the Thurin CLI, the og service, and any
 * Node or worker consumer import. The root entry re-exports all of this plus the
 * React hooks, provider, and ThurinCard.
 */
export { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref, FARCASTER_HUB } from './proofs'
export type { ProofOptions } from './proofs'
export { parsePgpKey, verifyAttestation, verifyClearsigned, stripEmailUserIDs, hasEmailUserID, verifyStatementSignature, statementText, leanKey, leanSignature, claimSignature, payloadText } from './pgp'
export type { StrippedKey, LeanKey, PgpInput } from './pgp'
export { fetchEFPGraph } from './efp'
export {
  normalizeFingerprint, fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes,
} from './fingerprint'
export {
  EIP712_NAME, EIP712_VERSION, AUTHORIZATION_TYPES, registryDomain,
  attestTypedData, reattestTypedData, updateKeyTypedData, revokeTypedData, setRecordTypedData,
  authorizationDigest, recordKind, REVOKE_REASONS, OWNER_REVOKE_REASONS,
} from './authorization'
export type {
  AuthorizationAction, AttestAuthorization, ReattestAuthorization, UpdateKeyAuthorization,
  RevokeAuthorization, SetRecordAuthorization, RevokeReason,
} from './authorization'
export type {
  ThurinIdentity, Attestation, PGPVerification, ClaimCheckKind, PGPKeyInfo, SubkeyInfo, Notation, Proof,
  ProofResult, EFPGraph, Theme, IdentityKitConfig,
} from './types'
export { REGISTRY_ADDRESS, REGISTRY_ABI, NETWORKS, getRegistry, isNetworkName, chainFor } from './contract'
export {
  MAX_RECORD_BYTES, MAX_KIND_BYTES, KNOWN_KINDS, IDENTITY_KINDS, kindName, checkKindName, checkRecordValue, pickRecords, pageRecords, HIDDEN_KINDS,
  parsePointer, addPointer, renderPointer, parseRecord, fetchRecords,
} from './records'
export type { KnownKind, ParsedRecord, RecordData, PointerEntry, PointerRecord, RecordReader } from './records'
export { identityErrorKind, needsRpcProbe, IDENTITY_ERROR_TEXT } from './identityError'
export { CLAIM_CHECK_LABEL, claimCheckText, formatClaimDate, expiresSoon, expiresSoonText, claimFates, claimFateText } from './claimStatus'
export type { ClaimCheckText, ClaimFate } from './claimStatus'
export type { IdentityErrorKind, IdentityLookupState } from './identityError'
export { avatarUrl, avatarFallbacks, parseNftAvatar, nftAvatarImage, NFT_AVATAR_ABI, IPFS_GATEWAY, IPFS_GATEWAYS, ARWEAVE_GATEWAY } from './avatar'
export type { NftAvatar } from './avatar'
export { ENS_HINT_KEY, ENS_TEXT_RESOLVER_ABI, ensHintFor, ensHintValue, ensHintWrite, fetchEnsHint } from './ensHint'
export type { EnsHint, EnsHintState, EnsTextReader } from './ensHint'
export type { NetworkName, RegistryDeployment } from './contract'
