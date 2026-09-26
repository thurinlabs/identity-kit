/** Each custom error the registry can revert with, as a sentence to show people. From the contract's NatSpec. */
export const CONTRACT_ERROR_TEXT: Record<string, string> = {
  AlreadyRevoked: 'That claim has already ended, or is already marked compromised.',
  BadArmorChecksum: "The armor's checksum doesn't match its data: the paste was changed or cut short.",
  BadBase64: "The armored data isn't valid base64.",
  ClaimActive: 'That claim is still active: revoke it with the reason "compromised" instead.',
  DeploymentFailed: "The key and signature couldn't be stored: together they're over the contract's size limit.",
  DuplicateActiveFingerprint: 'This address already has an active claim for this key: update it or replace it instead.',
  EmptyKey: 'No key was given.',
  EmptySignature: 'No signature was given.',
  IndexOutOfBounds: 'This address has no claim at that index.',
  InvalidFingerprint: 'That 32-byte fingerprint ends in 12 zero bytes, which no real v6 key has.',
  InvalidFingerprintLength: "The fingerprint isn't 20 bytes (v4 key) or 32 bytes (v6 key).",
  InvalidKindName: "The record name is empty, longer than 31 bytes, or uses something other than a-z, 0-9, '-', and '.'.",
  InvalidPermission: "The permission isn't the owner's signature over exactly this change and their current nonce: it was already used, cancelled, or superseded by a newer one.",
  InvalidPointer: 'There is no stored data at that address.',
  KeyCompromised: 'This address marked the key compromised: it can never claim it again.',
  KeyStillActive: 'This address still has an active claim for the key: revoke that claim as "compromised" instead.',
  KeyTooLarge: 'The key is over 16,384 bytes: export it without photos or old signatures.',
  NotAKey: "The key doesn't start with an OpenPGP public-key packet: give gpg's export of the public key.",
  NotASignature: "The signature is neither an OpenPGP signature nor a clearsigned message.",
  NotArmored: 'The paste has no -----BEGIN PGP and -----END PGP lines.',
  PayloadTooLarge: 'The signature and key together are over 24,000 bytes.',
  PermissionExpired: 'The permission is past its deadline: ask the owner for a new one.',
  RecordTooLarge: 'The record value is over 1,024 bytes.',
  SignatureTooLarge: 'The signature is over 8,192 bytes.',
  SupersededIsSetByReattest: '"superseded" is set only by replacing a claim: pick another reason.',
  TooManyClaims: 'This address has reached the limit of 65,535 claims.',
  UnknownRevokeReason: 'The revoke reason must be empty, "compromised", "retired", or "other".',
  UnsupportedHeader: "Armor header lines (like Comment:) can't be told from the data, as when line breaks were lost: remove them.",
}

/** The registry's custom error name inside a viem error, following `cause` down; null when it isn't a contract revert. */
export function contractErrorName(err: unknown): string | null {
  for (let e: any = err, depth = 0; e && depth < 8; e = e.cause, depth++) {
    const name = e.data?.errorName ?? e.errorName
    if (typeof name === 'string' && name) return name
  }
  return null
}

/** The sentence for a registry revert inside a viem error, or null when it isn't one. */
export function contractErrorText(err: unknown): string | null {
  const name = contractErrorName(err)
  return name ? CONTRACT_ERROR_TEXT[name] ?? `The registry refused it (${name}).` : null
}
