export interface Attestation {
  index: number
  fingerprint: string
  createdAt: number
  revoked: boolean
  pgpSignature: string | null
  pgpPublicKey: string | null
  txHash: string | null
  verification: PGPVerification | null
}

export interface PGPVerification {
  verified: boolean
  reason?: string
}

export interface PGPKeyInfo {
  fingerprint: string
  userIDs: string[]
  algorithm: string
  created: string | null
  expires: string | null
  notations: Notation[]
  subkeys: SubkeyInfo[]
}

export interface SubkeyInfo {
  algorithm: string
  created: string | null
  fingerprint: string
}

export interface Notation {
  name: string
  value: string
}

export interface Proof {
  provider: string
  label: string
  url: string
  user?: string
  instance?: string
  repo?: string
  gistId?: string
  castHash?: string
  domain?: string
}

export interface ProofResult {
  provider: string
  label: string
  url: string
  displayUrl: string
  href: string | null
  secondaryHref: string | null
  status: 'verified' | 'unverified' | 'pending' | 'skipped'
  reason?: string
}

export interface EFPGraph {
  followers: number
  following: number
  top8: string[]
  hasEfp: boolean
}

export interface ThurinIdentity {
  address: string | null
  ensName: string | null
  ensAvatar: string | null
  claims: Attestation[]
  totalClaims: number
  activeClaims: number
  currentFingerprint: string | null
  pgpKeyInfo: PGPKeyInfo | null
  proofs: ProofResult[]
  efp: EFPGraph | null
  isLoading: boolean
  error: Error | null
}

export type Theme = 'thurin' | 'dark' | 'light'

export interface IdentityKitConfig {
  rpcUrl?: string
  neynarApiKey?: string
  baseUrl?: string
}
