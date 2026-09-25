import type { PGPKeyInfo, PGPVerification } from './types'

/**
 * openpgp.js refuses secp256k1 by default because RFC 9580 does not list the
 * curve — a compatibility choice, not a security one. A secp256k1 PGP key is a
 * valid key (and, incidentally, doubles as an Ethereum key: the address falls out
 * of the same public point). Thurin verifies signatures over any curve openpgp.js
 * can compute; whether a holder reuses such a key as a wallet is their business.
 * In Node, openpgp.js needs the optional `eckey-utils` package for this curve;
 * the browser build does not.
 *
 * The low-level packet/key methods take a *complete* config (they index into
 * it), so this builds one from the library's defaults rather than passing a
 * partial object.
 */
function pgpConfig(openpgp: typeof import('openpgp')) {
  // Accept secp256k1 only. Clearing the set would also accept anything openpgp.js adds to it
  // later for security reasons (terricola, 2026-09-23); removing one entry keeps that policy.
  const rejectCurves = new Set([...(openpgp.config.rejectCurves ?? [])].filter(c => c !== 'secp256k1'))
  return { ...openpgp.config, rejectCurves: rejectCurves as Set<never> }
}

/** Human-readable algorithm for a key or subkey packet: "Ed25519", "Cv25519", "RSA 4096", "NIST P-256", … */
function algorithmName(keyOrSubkey: any): string {
  try {
    const info = keyOrSubkey.getAlgorithmInfo() as { algorithm: string; bits?: number; curve?: string }
    const curve = (info.curve || '').toLowerCase()
    if (curve.startsWith('ed25519') || info.algorithm === 'ed25519' || info.algorithm === 'eddsaLegacy') return 'Ed25519'
    if (curve.startsWith('curve25519') || info.algorithm === 'x25519') return 'Cv25519'
    if (curve.startsWith('ed448')) return 'Ed448'
    if (curve.startsWith('curve448') || info.algorithm === 'x448') return 'X448'
    if (curve.startsWith('nistp') || curve.startsWith('p')) return `NIST P-${curve.replace(/\D/g, '')}`
    if (curve.startsWith('secp')) return curve
    if (curve.startsWith('brainpool')) return curve
    if (info.algorithm.startsWith('rsa')) return info.bits ? `RSA ${info.bits}` : 'RSA'
    if (info.algorithm.startsWith('dsa')) return info.bits ? `DSA ${info.bits}` : 'DSA'
    if (info.algorithm.startsWith('elgamal')) return info.bits ? `ElGamal ${info.bits}` : 'ElGamal'
    return info.curve || info.algorithm
  } catch {
    return String(keyOrSubkey.keyPacket?.algorithm ?? 'unknown')
  }
}

/**
 * A key or signature as it arrives: armored text, raw bytes, or the `0x…` hex a contract call
 * returns. The registry stores raw bytes (or a clearsigned message as text); pasted gpg output is
 * armored. Callers never have to know which.
 */
export type PgpInput = string | Uint8Array

const TEXT_START = 0x2d // '-', every armor and clearsign header starts with it

function hexToBytes(hex: string): Uint8Array {
  const h = hex.slice(2)
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16)
  return out
}

/** Text if it is armored or clearsigned, bytes if it is raw OpenPGP packets. */
function normalizeInput(input: PgpInput): string | Uint8Array {
  if (typeof input === 'string') {
    const t = input.trim()
    if (/^0x([0-9a-fA-F]{2})*$/.test(t)) return normalizeInput(hexToBytes(t))
    return input
  }
  if (input.length > 0 && input[0] === TEXT_START) return new TextDecoder().decode(input)
  return input
}

async function readKeyAny(openpgp: typeof import('openpgp'), input: PgpInput) {
  const v = normalizeInput(input)
  return typeof v === 'string' ? openpgp.readKey({ armoredKey: v }) : openpgp.readKey({ binaryKey: v })
}

/** Signature packets from a detached signature (armored or raw) or a clearsigned message (with its text). */
async function readSignatureAny(openpgp: typeof import('openpgp'), input: PgpInput): Promise<{ packets: any[]; text: string | null; signature: any }> {
  const v = normalizeInput(input)
  if (typeof v === 'string' && v.includes('-----BEGIN PGP SIGNED MESSAGE-----')) {
    const message: any = await openpgp.readCleartextMessage({ cleartextMessage: v })
    return { packets: message.signature.packets, text: message.getText(), signature: message.signature }
  }
  const signature: any = typeof v === 'string'
    ? await openpgp.readSignature({ armoredSignature: v })
    : await openpgp.readSignature({ binarySignature: v })
  return { packets: signature.packets, text: null, signature }
}

/** The line every claim signs (message version 1). The address is lowercased. */
export function statementText(address: string): string {
  return `I control the Ethereum address: ${address.toLowerCase()}`
}

export async function parsePgpKey(armoredKey: PgpInput): Promise<PGPKeyInfo | null> {
  try {
    const openpgp = await import('openpgp')
    const config = pgpConfig(openpgp)
    const key = await readKeyAny(openpgp, armoredKey)
    const fingerprint = key.getFingerprint().toUpperCase()
    const algorithm = algorithmName(key)
    const created = key.keyPacket.created?.toISOString() ?? null
    const expiration = await key.getExpirationTime()
    const expires =
      expiration && expiration !== Infinity
        ? new Date(expiration as number).toISOString()
        : null

    // openpgp does not verify certification signatures when a key is parsed —
    // it groups them by issuer key ID only. A key's fingerprint also covers
    // only the primary key packet, not its user IDs or their certifications.
    // Each self-certification is therefore verified against the primary key
    // here before its user ID and notations are treated as authoritative.
    const userIDs: string[] = []
    const notations: { name: string; value: string }[] = []
    const seen = new Set<string>()
    for (const user of key.users) {
      const certs = (user as any).selfCertifications
      if (!certs || certs.length === 0) continue

      let userVerified = false
      for (const cert of certs) {
        try {
          await cert.verify(
            key.keyPacket,
            cert.signatureType,
            { userID: (user as any).userID, key: key.keyPacket },
            undefined,   // date: now
            undefined,   // detached
            config,
          )
        } catch {
          continue // signature not made by this key — ignore this certification
        }
        userVerified = true

        if (cert.rawNotations) {
          for (const n of cert.rawNotations) {
            const name =
              typeof n.name === 'string' ? n.name : new TextDecoder().decode(n.name)
            const value =
              n.value instanceof Uint8Array
                ? new TextDecoder().decode(n.value)
                : typeof n.value === 'string'
                  ? n.value
                  : null
            if (value) {
              // Dedupe by value alone: the same proof target is often present
              // under both proof@thurin.id and proof@ariadne.id, and should
              // surface once, not once per namespace.
              if (!seen.has(value)) {
                seen.add(value)
                notations.push({ name, value })
              }
            }
          }
        }
      }

      if (userVerified) {
        const uid = (user as any).userID?.userID
        if (uid) userIDs.push(uid)
      }
    }

    const subkeys = key.subkeys.map((sk: any) => ({
      algorithm: algorithmName(sk),
      created: sk.keyPacket.created?.toISOString() ?? null,
      fingerprint: sk.getFingerprint().toUpperCase(),
    }))

    return { fingerprint, userIDs, algorithm, created, expires, notations, subkeys }
  } catch {
    return null
  }
}

/**
 * Verify a clearsigned message against an armored public key, the way gpg does: the signing
 * key (or subkey) must be valid *now* — bound to this primary, unrevoked, unexpired — and the
 * signature must be sound. We deliberately do not ask openpgp.verify(), which also demands
 * the key was valid at the instant the signature was made. Thurin's update flow tells people
 * to `export-minimal` after editing notations, which keeps only the newest self-certification;
 * when that postdates the signature (Ben's own key, 2026-09-14: notations edited 16 minutes
 * after signing), openpgp.verify() reports "Could not find valid self-signature" for a
 * signature gpg verifies fine. A key that has since been revoked or expired still fails here.
 * These are internals the .d.ts does not expose (the signature packet list, the
 * CRLF-normalised text, LiteralDataPacket.setText); they are stable across openpgp.js 6 and
 * exercised by the real-data tests in attestation.test.ts.
 *
 * Used for attestation statements and for clearsigned records such as `thurin.canary`.
 */
/** Check signature packets over `text` against the key, judging key validity now (see below). */
async function verifySignedText(openpgp: typeof import('openpgp'), publicKey: any, packets: any[], text: string): Promise<boolean> {
  const { LiteralDataPacket } = openpgp
  const config = pgpConfig(openpgp)
  const now = new Date()
  for (const sig of packets) {
    if (!publicKey.getKeys(sig.issuerKeyID).length) continue
    const signingKey = await publicKey.getSigningKey(sig.issuerKeyID, now, undefined, config)
    const literal: any = new LiteralDataPacket()
    literal.setText(text.replace(/\r?\n/g, '\r\n'))
    await sig.verify(signingKey.keyPacket, sig.signatureType, literal, now, true, config)
    return true
  }
  return false
}

export async function verifyClearsigned({ armoredKey, clearsigned }: { armoredKey: PgpInput; clearsigned: string }): Promise<{ verified: boolean; reason?: string; text: string }> {
  try {
    const openpgp = await import('openpgp')
    const publicKey = await readKeyAny(openpgp, armoredKey)
    const message: any = await openpgp.readCleartextMessage({ cleartextMessage: clearsigned })
    const text = message.text ?? message.getText()
    if (await verifySignedText(openpgp, publicKey, message.signature.packets, text)) return { verified: true, text: message.getText() }
    return { verified: false, reason: 'Message is not signed by this key', text: message.getText() }
  } catch (err) {
    return { verified: false, reason: err instanceof Error ? err.message : 'Verification failed', text: '' }
  }
}

/**
 * A detached signature over the claim statement for `address`, exactly as `printf '%s'` gives it
 * (no trailing line break): the only form the registry's `clearsigned()` view can show to gpg.
 */
export async function verifyStatementSignature({ key, signature, address }: { key: PgpInput; signature: PgpInput; address: string }): Promise<{ verified: boolean; reason?: string; text: string }> {
  const text = statementText(address)
  try {
    const openpgp = await import('openpgp')
    const publicKey = await readKeyAny(openpgp, key)
    const { packets } = await readSignatureAny(openpgp, signature)
    if (await verifySignedText(openpgp, publicKey, packets, text)) return { verified: true, text }
    return { verified: false, reason: 'Message is not signed by this key', text }
  } catch (err) {
    return { verified: false, reason: err instanceof Error ? err.message : 'Verification failed', text }
  }
}

const REVOCATION_REASON: Record<number, string> = { // 0 = "no reason specified", gpg's default: say nothing rather than "(reason: no reason given)"
  1: 'replaced by a newer key', 2: 'compromised', 3: 'no longer used', 32: 'a user ID is no longer valid' }

const iso = (d: Date | number | null | undefined) =>
  d instanceof Date ? d.toISOString() : typeof d === 'number' && Number.isFinite(d) ? new Date(d).toISOString() : null

/** The newest revocation packet's date and reason (the one that makes isRevoked true). */
function revocationOf(sigs: any[]): { at: string | null; compromised: boolean; revocationReason: string | null } {
  const sig = [...(sigs ?? [])].sort((a, b) => (b.created?.getTime?.() ?? 0) - (a.created?.getTime?.() ?? 0))[0]
  const flag = sig?.reasonForRevocationFlag ?? null
  return {
    at: iso(sig?.created),
    compromised: flag === 2,
    revocationReason: sig?.reasonForRevocationString || (flag !== null ? REVOCATION_REASON[flag] ?? null : null),
  }
}

/**
 * The life of the key behind a claim, judged now: revoked? expired? and the same for the subkey
 * that signed. `problem` is the reason a claim stops counting, most important first; `expiresAt`
 * is the earlier of the two expiries, for "expires soon".
 */
async function keyLife(openpgp: typeof import('openpgp'), key: any, issuer: any, config: any) {
  const now = new Date()
  const signer = issuer && !key.getKeyID().equals(issuer) ? key.subkeys.find((s: any) => s.getKeyID().equals(issuer)) ?? null : key
  const signingKey = signer ? signer.getFingerprint().toUpperCase() : null

  const safe = async <T,>(f: () => Promise<T>, fallback: T) => { try { return await f() } catch { return fallback } }
  const keyRevoked = await safe(() => key.isRevoked(undefined, undefined, now, config), false)
  const keyExp = await safe(() => key.getExpirationTime(undefined, config), null)
  const isSub = signer && signer !== key
  const subRevoked = isSub ? await safe(() => signer.isRevoked(null, key.keyPacket, now, config), false) : false
  const subExp = isSub ? await safe(() => signer.getExpirationTime(null, config), null) : null

  const finite = (d: any) => d instanceof Date && Number.isFinite(d.getTime()) ? d : null
  const kExp = finite(keyExp), sExp = finite(subExp)
  let problem: Partial<PGPVerification> | null = null
  if (keyRevoked) {
    const r = revocationOf(key.revocationSignatures)
    problem = { kind: r.compromised ? 'compromised' : 'revoked', at: r.at, revocationReason: r.revocationReason }
  } else if (kExp && kExp <= now) {
    problem = { kind: 'expired', at: kExp.toISOString() }
  } else if (subRevoked) {
    const r = revocationOf(signer.revocationSignatures)
    problem = { kind: r.compromised ? 'compromised' : 'signing-key-revoked', at: r.at, revocationReason: r.revocationReason }
  } else if (sExp && sExp <= now) {
    problem = { kind: 'signing-key-expired', at: sExp.toISOString() }
  }
  const earliest = [kExp, sExp].filter(Boolean).sort((a: any, b: any) => a - b)[0] as Date | undefined
  return { problem, signingKey, expiresAt: earliest ? earliest.toISOString() : null, algorithm: algorithmName(signer ?? key) }
}

export async function verifyAttestation({
  pgpPublicKey,
  pgpSignature,
  fingerprint,
  ethAddress,
}: {
  pgpPublicKey: PgpInput | null
  pgpSignature: PgpInput | null
  fingerprint: string
  ethAddress: string
}): Promise<PGPVerification> {
  try {
    if (!pgpPublicKey || !pgpSignature) {
      return { verified: false, reason: 'Missing PGP data', kind: 'bad-signature' }
    }

    const openpgp = await import('openpgp')

    const publicKey = await readKeyAny(openpgp, pgpPublicKey)
    const keyFingerprint = publicKey.getFingerprint().toUpperCase()
    if (keyFingerprint !== fingerprint.toUpperCase()) {
      return { verified: false, reason: 'Key fingerprint mismatch', kind: 'bad-signature' }
    }

    // A detached signature over the rebuilt statement, or a clearsigned message stored as-is.
    let sig: Awaited<ReturnType<typeof readSignatureAny>>
    try { sig = await readSignatureAny(openpgp, pgpSignature) }
    catch { return { verified: false, reason: 'Unreadable signature', kind: 'bad-signature' } }
    const life = await keyLife(openpgp, publicKey, sig.packets[0]?.issuerKeyID ?? null, pgpConfig(openpgp))
    const v = sig.text !== null
      ? await verifyClearsigned({ armoredKey: publicKey.armor(), clearsigned: normalizeInput(pgpSignature) as string })
      : await verifyStatementSignature({ key: publicKey.armor(), signature: pgpSignature, address: ethAddress })
    if (!v.verified) {
      // Name the cause: the key's life first (the usual way a real claim stops counting), then an
      // algorithm the library refuses, then the signature itself.
      if (life.problem) return { verified: false, reason: v.reason, signingKey: life.signingKey, ...life.problem }
      if (/too weak|reject|unsupported|not supported|unknown (curve|algorithm)/i.test(v.reason || '')) {
        return { verified: false, reason: v.reason, kind: 'unsupported', algorithm: life.algorithm, signingKey: life.signingKey }
      }
      return { verified: false, reason: v.reason, kind: 'bad-signature', signingKey: life.signingKey }
    }

    // The signed text must be the statement for this address (a clearsigned message may end in a line break).
    if (v.text.trim().toLowerCase() !== statementText(ethAddress).toLowerCase()) {
      return { verified: false, reason: 'Signed text is not the statement for this address', kind: 'bad-signature', signingKey: life.signingKey }
    }

    return { verified: true, kind: 'verified', signingKey: life.signingKey, expiresAt: life.expiresAt }
  } catch {
    return { verified: false, reason: 'Signature verification failed', kind: 'bad-signature' }
  }
}

export interface StrippedKey {
  /** Armored public key containing only the non-email user IDs. */
  armored: string
  /** The same key as raw bytes. */
  binary: Uint8Array
  /** User IDs kept (no `@`). */
  kept: string[]
  /** User IDs removed (contained an `@`). */
  removed: string[]
}

const EMAIL_UID = /@/

/**
 * Remove every user ID that contains an email address, keeping the rest (and
 * their self-certifications, so proof notations on a non-email user ID survive).
 * Returns null when nothing would remain — openpgp needs at least one
 * self-certified user ID to verify signatures, so such a key must not be
 * published. The key material and subkeys are untouched; the fingerprint is
 * unchanged.
 */
export async function stripEmailUserIDs(armoredKey: PgpInput): Promise<StrippedKey | null> {
  try {
    const openpgp = await import('openpgp')
    const key = await readKeyAny(openpgp, armoredKey)
    const kept: string[] = []
    const removed: string[] = []
    const users = (key as any).users.filter((u: any) => {
      const uid: string | undefined = u.userID?.userID
      if (!uid) return false
      if (EMAIL_UID.test(uid)) { removed.push(uid); return false }
      kept.push(uid)
      return true
    })
    if (users.length === 0) return null
    ;(key as any).users = users
    return { armored: key.armor(), binary: key.write(), kept, removed }
  } catch {
    return null
  }
}

/** True when any user ID on the key contains an email address. */
export async function hasEmailUserID(armoredKey: PgpInput): Promise<boolean> {
  try {
    const openpgp = await import('openpgp')
    const key = await readKeyAny(openpgp, armoredKey)
    return (key as any).users.some((u: any) => EMAIL_UID.test(u.userID?.userID ?? ''))
  } catch {
    return false
  }
}

export interface LeanKey {
  /** The key to store, as raw bytes. */
  binary: Uint8Array
  kept: string[]
  removed: string[]
  /** Fingerprints of authentication-only subkeys left out. */
  droppedSubkeys: string[]
}

/**
 * The key as a claim stores it: raw bytes; email user IDs left out unless
 * `includeEmail`; authentication-only subkeys (SSH) left out, since nobody fetches those from a
 * keyserver. Everything else stays: the primary key, the remaining user IDs, every signing and
 * encryption subkey, and every revocation (so a revoked name or subkey reads as revoked). Like
 * gpg's export-minimal, only the newest self-signature per user ID and subkey is kept and
 * third-party certifications are dropped. The fingerprint doesn't change. Null when no user ID
 * would remain.
 */
export async function leanKey(input: PgpInput, { includeEmail = false }: { includeEmail?: boolean } = {}): Promise<LeanKey | null> {
  try {
    const openpgp = await import('openpgp')
    const key: any = await readKeyAny(openpgp, input)
    const kept: string[] = []
    const removed: string[] = []
    const users = key.users.filter((u: any) => {
      const uid: string | undefined = u.userID?.userID
      if (!uid) return false
      if (!includeEmail && EMAIL_UID.test(uid)) { removed.push(uid); return false }
      kept.push(uid)
      return true
    })
    if (users.length === 0) return null
    // Like gpg's export-minimal: the newest self-signature per user ID and per subkey, no
    // third-party certifications. Revocations always stay.
    const newest = (sigs: any[] = []) => sigs.length ? [[...sigs].sort((x: any, y: any) => (y.created?.getTime?.() ?? 0) - (x.created?.getTime?.() ?? 0))[0]] : []
    // A revoked user ID keeps only its revocation (as gpg does): its self-signature adds nothing.
    for (const u of users) { u.selfCertifications = u.revocationSignatures?.length ? [] : newest(u.selfCertifications); u.otherCertifications = [] }
    key.users = users
    key.directSignatures = newest(key.directSignatures)
    for (const sk of key.subkeys) sk.bindingSignatures = newest(sk.bindingSignatures)

    const { keyFlags } = openpgp.enums
    const droppedSubkeys: string[] = []
    key.subkeys = key.subkeys.filter((sk: any) => {
      const binding = [...(sk.bindingSignatures ?? [])].sort((a: any, b: any) => (b.created?.getTime?.() ?? 0) - (a.created?.getTime?.() ?? 0))[0]
      const flags = binding?.keyFlags?.[0] ?? 0
      const authOnly = (flags & keyFlags.authentication) !== 0
        && (flags & (keyFlags.signData | keyFlags.encryptCommunication | keyFlags.encryptStorage | keyFlags.certifyKeys)) === 0
      if (authOnly) droppedSubkeys.push(sk.getFingerprint().toUpperCase())
      return !authOnly
    })
    return { binary: key.write(), kept, removed, droppedSubkeys }
  } catch {
    return null
  }
}

/** The signature as a claim stores it: the raw signature packet, from a detached signature or a clearsigned message. */
export async function leanSignature(input: PgpInput): Promise<Uint8Array | null> {
  try {
    const openpgp = await import('openpgp')
    const { signature } = await readSignatureAny(openpgp, input)
    return signature.write()
  } catch {
    return null
  }
}

/**
 * What to store as a claim's signature. A detached signature is stored as its own raw bytes
 * (message version 1). A clearsigned message is reduced to its signature when that covers the
 * statement exactly; otherwise (e.g. made with `echo`, which signs a trailing line break) the
 * whole message is kept as text (version 0), so gpg can still verify what the registry returns.
 */
export async function claimSignature({ signature, key, address }: { signature: PgpInput; key: PgpInput; address: string }): Promise<{ signature: Uint8Array | string; messageVersion: 0 | 1 } | null> {
  try {
    const openpgp = await import('openpgp')
    const sig = await readSignatureAny(openpgp, signature)
    if (sig.text === null) {
      // Keep the signature's own bytes (gpg writes old-style packet headers; re-writing would change them).
      const v = normalizeInput(signature)
      const raw = typeof v === 'string' ? (await openpgp.unarmor(v)).data as Uint8Array : v
      return { signature: raw, messageVersion: 1 }
    }
    const packet: Uint8Array = sig.signature.write()
    if ((await verifyStatementSignature({ key, signature: packet, address })).verified) return { signature: packet, messageVersion: 1 }
    return { signature: normalizeInput(signature) as string, messageVersion: 0 }
  } catch {
    return null
  }
}

/**
 * A stored key or signature as armored text, for display, copy buttons, and `gpg --import`.
 * A clearsigned message comes back as stored. Accepts the `0x…` hex a contract call returns.
 * Null if it isn't OpenPGP data.
 */
export async function payloadText(input: PgpInput, kind: 'key' | 'signature'): Promise<string | null> {
  try {
    const v = normalizeInput(input)
    if (typeof v === 'string') return v
    const openpgp = await import('openpgp')
    if (kind === 'key') return (await openpgp.readKey({ binaryKey: v })).armor()
    return (await openpgp.readSignature({ binarySignature: v })).armor()
  } catch {
    return null
  }
}
