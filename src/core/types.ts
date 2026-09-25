export interface Attestation {
  /** Position in the owner's claim history. */
  index: number
  /** Lowercase hex fingerprint, no 0x (40 chars for v4 keys, 64 for v6). */
  fingerprint: string
  /** Unix seconds. */
  createdAt: number
  revoked: boolean
  /** Unix seconds, or null while active. */
  revokedAt: number | null
  /** 'active', 'revoked', or 'replaced' (revoked by a reattest). */
  state: 'active' | 'revoked' | 'replaced'
  /** The claim that replaced this one, when `state` is 'replaced'. */
  replacedBy: number | null
  /** The owner's revoke reason: '', 'compromised', 'retired', 'superseded', or 'other'. */
  revokeReason: string
  /** 1 = detached signature over the statement; 0 = a clearsigned message stored as submitted. */
  messageVersion: number
  /** The signature as armored text, or the clearsigned message (null only if the read failed). */
  pgpSignature: string | null
  /** The armored public key (null only if the read failed). */
  pgpPublicKey: string | null
  /** null when the claim wasn't read: older than `readClaims`' limit. */
  verification: PGPVerification | null
}

/** Why a claim does or doesn't count, in a form a UI can word (see CLAIM_CHECK_LABEL). */
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
  /** Why a claim doesn't count, or `verified`. */
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
