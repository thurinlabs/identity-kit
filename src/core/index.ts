/**
 * @thurinlabs/identity-kit: reads and checks Thurin.id claims. No React, wagmi, or DOM
 * dependency, so it runs in Node, workers, and browsers alike. `/core` is the same entry.
 */
export { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref, FARCASTER_HUB } from './proofs'
export type { ProofOptions } from './proofs'
export { parsePgpKey, verifyAttestation, verifyClearsigned, stripEmailUserIDs, hasEmailUserID, verifyStatementSignature, statementText, leanKey, claimSignature, signatureEmail, payloadText } from './pgp'
export type { StrippedKey, LeanKey, PgpInput } from './pgp'
export {
  normalizeFingerprint, fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes,
} from './fingerprint'
export {
  EIP712_NAME, EIP712_VERSION, AUTHORIZATION_TYPES, registryDomain,
  attestTypedData, reattestTypedData, updateKeyTypedData, revokeTypedData, setRecordTypedData, markCompromisedTypedData,
  authorizationDigest, recordKind, REVOKE_REASONS, OWNER_REVOKE_REASONS,
} from './authorization'
export type {
  AuthorizationAction, AttestAuthorization, ReattestAuthorization, UpdateKeyAuthorization,
  RevokeAuthorization, SetRecordAuthorization, MarkCompromisedAuthorization, RevokeReason,
} from './authorization'
export type {
  Attestation, PGPVerification, ClaimCheckKind, PGPKeyInfo, SubkeyInfo, Notation, Proof,
} from './types'
export { REGISTRY_ADDRESS, REGISTRY_ABI, NETWORKS, getRegistry, isNetworkName, chainFor } from './contract'
export { readClaims, keyStanding, findOwners, CLAIM_LIMIT } from './claims'
export type { ClaimReader, KeyStanding } from './claims'
export {
  MAX_RECORD_BYTES, MAX_KIND_BYTES, KNOWN_KINDS, kindName, checkKindName, checkRecordValue, pickRecords, pageRecords,
  parseReleases, addRelease, renderReleases, parseRecord, fetchRecords,
} from './records'
export type { KnownKind, ParsedRecord, RecordData, ReleaseEntry, ReleasesRecord, RecordReader } from './records'
export { CLAIM_CHECK_LABEL, claimCheckText, formatClaimDate, expiresSoon, expiresSoonText, claimFates, claimFateText } from './claimStatus'
export type { ClaimCheckText, ClaimFate } from './claimStatus'
export { avatarUrl, avatarFallbacks, parseNftAvatar, nftAvatarImage, NFT_AVATAR_ABI, IPFS_GATEWAY, IPFS_GATEWAYS, ARWEAVE_GATEWAY } from './avatar'
export type { NftAvatar } from './avatar'
export { ENS_HINT_KEY, ENS_TEXT_RESOLVER_ABI, ensHintFor, ensHintValue, ensHintWrite, fetchEnsHint } from './ensHint'
export type { EnsHint, EnsHintState, EnsTextReader } from './ensHint'
export type { NetworkName, RegistryDeployment } from './contract'
