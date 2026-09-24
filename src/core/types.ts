export interface Attestation {
  /** Position in the owner's attestation history. */
  index: number
  /** Lowercase hex fingerprint, no 0x (40 chars for v4 keys, 64 for v6). */
  fingerprint: string
  /** Unix seconds. */
  createdAt: number
  revoked: boolean
  /** Unix seconds, or null while active. */
  revokedAt: number | null
  /** Format of the clearsigned message (1 = "I control the Ethereum address: <address>"). */
  messageVersion: number
  /** The clearsigned message stored on-chain (null only if the payload read failed). */
  pgpSignature: string | null
  /** The armored public key stored on-chain (null only if the payload read failed). */
  pgpPublicKey: string | null
  verification: PGPVerification | null
}

/** Why a claim does or doesn't count, in a form a UI can word (see CLAIM_CHECK_LABEL). Since 1.4.0. */
export type ClaimCheckKind =
  | 'verified'
  | 'expired'              // the key's expiry has passed
  | 'signing-key-expired'  // the subkey that signed the claim has expired
  | 'revoked'              // the owner revoked the PGP key
  | 'compromised'          // …revoked as compromised
  | 'signing-key-revoked'  // the subkey that signed the claim was revoked
  | 'unsupported'          // an algorithm Thurin doesn't check (e.g. DSA)
  | 'bad-signature'        // the stored signature, fingerprint, or address doesn't match

export interface PGPVerification {
  verified: boolean
  /** The underlying library message, for logs; show `kind` to people instead. */
  reason?: string
  /** Since 1.4.0. */
  kind?: ClaimCheckKind
  /** ISO date that goes with `kind`: when the key or subkey expired or was revoked. */
  at?: string | null
  /** The owner's revocation reason (their words, or the reason code's name). */
  revocationReason?: string | null
  /** Fingerprint of the key or subkey that made the claim's signature. */
  signingKey?: string | null
  /** When verified: the earlier expiry of the key and the signing subkey (ISO), or null if neither expires. */
  expiresAt?: string | null
  /** For `unsupported`: the algorithm, e.g. "DSA 2048". */
  algorithm?: string | null
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
  /** Set when the identity couldn't be shown; the message is plain and safe to display. */
  error: Error | null
  /** Why: the RPC didn't answer, the ENS name has no address, or a registry read failed. */
  errorKind: 'rpc' | 'not-found' | 'read' | null
  /** Re-run the lookups (for a "Try again" button). */
  retry: () => void
}

export type Theme = 'thurin' | 'dark' | 'light'

export interface IdentityKitConfig {
  rpcUrl?: string
  /** Optional: read Farcaster proofs through Neynar's hub with this key. Not needed since 1.3.7. */
  neynarApiKey?: string
  /** A Farcaster node's HTTP API for Farcaster proofs. Default: Quilibrium's public Hypersnap node (keyless). */
  farcasterHub?: string
  baseUrl?: string
  /** Which PGPRegistry deployment to read: 'mainnet' (default) or 'sepolia'. */
  network?: 'mainnet' | 'sepolia' | 'local'
  /** Override the registry address (e.g. a local deploy that landed elsewhere). */
  registryAddress?: string
}
