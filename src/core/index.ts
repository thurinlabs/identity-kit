/**
 * @thurinlabs/identity-kit/core — the verification and data layer with no React,
 * wagmi, or DOM dependency. This is what the Thurin CLI, the og service, and any
 * Node or worker consumer import. The root entry re-exports all of this plus the
 * React hooks, provider, and ThurinCard.
 */
export { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref } from './proofs'
export { parsePgpKey, verifyAttestation, stripEmailUserIDs, hasEmailUserID, fetchKeyByFingerprint, fetchKeyByKeyId } from './pgp'
export type { StrippedKey } from './pgp'
export { fetchEFPGraph } from './efp'
export {
  normalizeFingerprint, fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes,
} from './fingerprint'
export {
  EIP712_NAME, EIP712_VERSION, AUTHORIZATION_TYPES, registryDomain,
  attestTypedData, reattestTypedData, updateKeyTypedData, revokeTypedData, setRecordTypedData,
  authorizationDigest, recordKind,
} from './authorization'
export type {
  AuthorizationAction, AttestAuthorization, ReattestAuthorization, UpdateKeyAuthorization,
  RevokeAuthorization, SetRecordAuthorization,
} from './authorization'
export type {
  ThurinIdentity, Attestation, PGPVerification, PGPKeyInfo, SubkeyInfo, Notation, Proof,
  ProofResult, EFPGraph, Theme, IdentityKitConfig,
} from './types'
export { REGISTRY_ADDRESS, REGISTRY_ABI, NETWORKS, getRegistry, isNetworkName, chainFor } from './contract'
export type { NetworkName, RegistryDeployment } from './contract'
