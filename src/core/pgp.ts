import type { PGPKeyInfo, PGPVerification } from './types'

/**
 * openpgp.js's config, also accepting secp256k1: RFC 9580 leaves that curve out for compatibility,
 * not security. In Node the curve needs the optional `eckey-utils`. The low-level packet methods
 * index into a complete config, so this spreads the defaults.
 */
function pgpConfig(openpgp: typeof import('openpgp')) {
  // Allow secp256k1 and nothing else: clearing the set would also accept any curve openpgp.js
  // rejects later for security reasons.
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

/** A key or signature as armored text, raw bytes, or the `0x…` hex a contract call returns. */
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

    // openpgp groups certifications by issuer key ID without verifying them, and the fingerprint
    // doesn't cover user IDs, so each self-certification is verified before its name and notations count.
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
          continue // not made by this key
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
              // By value: the same proof often sits under both proof@thurin.id and proof@ariadne.id.
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
 * Signature packets over `text`, checked the way gpg does: the signing key or subkey must be valid
 * now, not at signing time as openpgp.verify() demands. `export-minimal` keeps only the newest
 * self-certification, and when that postdates the signature openpgp.verify() rejects what gpg
 * accepts. Uses openpgp.js 6 internals the .d.ts doesn't expose; attestation.test.ts covers them.
 */
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

/** A clearsigned message against a key, judged as gpg would: claims, and records such as `thurin.canary`. */
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

// 0 (no reason given, gpg's default) is left unsaid.
const REVOCATION_REASON: Record<number, string> = {
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
async function keyLife(key: any, issuer: any, config: any) {
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
    const life = await keyLife(publicKey, sig.packets[0]?.issuerKeyID ?? null, pgpConfig(openpgp))
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
// An email inside a notation value: a local part right before the @. Mastodon proof URLs
// (https://mastodon.social/@user) have a / before the @, so they don't match.
const EMAIL_IN_TEXT = /(?:^|[^\w/.+-])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/

/** Email addresses in a signature's notation values. */
function notationEmails(sig: any): string[] {
  const out: string[] = []
  for (const n of sig?.rawNotations ?? []) {
    const text = typeof n.value === 'string' ? n.value : new TextDecoder().decode(n.value)
    const m = text.match(EMAIL_IN_TEXT)
    if (m) out.push(m[1])
  }
  return out
}

/**
 * The key without its email user IDs; the rest keep their self-certifications and notations.
 * Null when no user ID would remain: openpgp needs one to verify signatures.
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
  /** Names left out: they contain an email, or a notation on them does. */
  removed: string[]
  /** Emails in notations on the key itself (not on a name), which can't be left out: refuse to publish these. */
  keyNotationEmails: string[]
}

/**
 * The key as a claim stores it, like gpg's export-minimal: raw bytes, the newest self-signature per
 * user ID and subkey, revocations kept. Email user IDs are left out unless `includeEmail`. Every subkey
 * stays, authentication (SSH) ones included. Null when no user ID would remain.
 */
export async function leanKey(input: PgpInput, { includeEmail = false }: { includeEmail?: boolean } = {}): Promise<LeanKey | null> {
  try {
    const openpgp = await import('openpgp')
    const key: any = await readKeyAny(openpgp, input)
    const kept: string[] = []
    const removed: string[] = []
    const newest = (sigs: any[] = []) => sigs.length ? [[...sigs].sort((x: any, y: any) => (y.created?.getTime?.() ?? 0) - (x.created?.getTime?.() ?? 0))[0]] : []
    // A revoked user ID keeps only its revocation (as gpg does): its self-signature adds nothing.
    for (const u of key.users) { u.selfCertifications = u.revocationSignatures?.length ? [] : newest(u.selfCertifications); u.otherCertifications = [] }
    // A name goes when it holds an email, or a notation on it does (a notation can't be cut out
    // of its signature without breaking it).
    const users = key.users.filter((u: any) => {
      const uid: string | undefined = u.userID?.userID
      if (!uid) return false
      if (!includeEmail && (EMAIL_UID.test(uid) || u.selfCertifications.some((c: any) => notationEmails(c).length))) { removed.push(uid); return false }
      kept.push(uid)
      return true
    })
    if (users.length === 0) return null
    key.users = users
    key.directSignatures = newest(key.directSignatures)
    const keyNotationEmails = includeEmail ? [] : key.directSignatures.flatMap(notationEmails)
    for (const sk of key.subkeys) sk.bindingSignatures = newest(sk.bindingSignatures)

    return { binary: key.write(), kept, removed, keyNotationEmails }
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
 * The email gpg signed in as the signer's user ID (from `-u me@example.com` or gpg.conf `sender`),
 * or null. It can't be removed without re-signing; `gpg --disable-signer-uid` leaves it out.
 */
export async function signatureEmail(signature: PgpInput): Promise<string | null> {
  try {
    const openpgp = await import('openpgp')
    const { packets } = await readSignatureAny(openpgp, signature)
    for (const p of packets) {
      const uid: string | null = p.signersUserID ?? null
      if (uid && uid.includes('@')) return uid
    }
    return null
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

export interface SshKey {
  /** An `authorized_keys` line without a comment: `ssh-ed25519 AAAA…`. */
  line: string
  /** As `ssh-keygen -l` shows it: `SHA256:…`. */
  sha256: string
  /** The PGP key or subkey it came from. */
  fingerprint: string
}

const AUTH_FLAG = 0x20

function sshString(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + bytes.length)
  new DataView(out.buffer).setUint32(0, bytes.length)
  out.set(bytes, 4)
  return out
}

function sshMpint(bytes: Uint8Array): Uint8Array {
  let i = 0
  while (i < bytes.length - 1 && bytes[i] === 0) i++
  const b = bytes.subarray(i)
  return sshString(b[0] & 0x80 ? new Uint8Array([0, ...b]) : b)
}

function sshBlob(p: any): { type: string; blob: Uint8Array<ArrayBuffer> } | null {
  const text = (s: string) => new TextEncoder().encode(s)
  const join = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0))
    let o = 0
    for (const x of parts) { out.set(x, o); o += x.length }
    return out
  }
  const { publicParams: pp } = p
  switch (p.algorithm) {
    case 1: case 3: // RSA
      return { type: 'ssh-rsa', blob: join(sshString(text('ssh-rsa')), sshMpint(pp.e), sshMpint(pp.n)) }
    case 22: // EdDSA (v4): Q is 0x40 then the 32-byte key
      if (pp.oid?.getName?.() !== 'ed25519Legacy' || pp.Q?.length !== 33) return null
      return { type: 'ssh-ed25519', blob: join(sshString(text('ssh-ed25519')), sshString(pp.Q.subarray(1))) }
    case 27: // Ed25519 (v6)
      return { type: 'ssh-ed25519', blob: join(sshString(text('ssh-ed25519')), sshString(pp.A)) }
    case 19: { // ECDSA on the NIST curves only; OpenSSH has no brainpool or secp256k1
      const curve = { nistP256: 'nistp256', nistP384: 'nistp384', nistP521: 'nistp521' }[pp.oid?.getName?.() as string]
      if (!curve) return null
      const type = `ecdsa-sha2-${curve}`
      return { type, blob: join(sshString(text(type)), sshString(text(curve)), sshString(pp.Q)) }
    }
    default: // Ed448, DSA, and the rest: OpenSSH can't use them
      return null
  }
}

function base64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/**
 * The key's SSH keys: every authentication key or subkey that is valid now (not expired, not
 * revoked), in a type OpenSSH accepts. What `gpg --export-ssh-key` prints, but every one, not only
 * the newest. Empty when there are none.
 */
export async function sshKeys(input: PgpInput): Promise<SshKey[]> {
  try {
    const openpgp = await import('openpgp')
    const config = pgpConfig(openpgp)
    const key: any = await readKeyAny(openpgp, input)
    const now = new Date()
    try { await key.verifyPrimaryKey(now, undefined, config) } catch { return [] }

    const newest = (sigs: any[] = []) => [...sigs].sort((x, y) => (y.created?.getTime?.() ?? 0) - (x.created?.getTime?.() ?? 0))[0]
    const candidates: { packet: any; flags: number }[] = []
    const primarySig = newest(key.directSignatures)?.keyFlags ? newest(key.directSignatures) : (await key.getPrimaryUser(now, undefined, config)).selfCertification
    candidates.push({ packet: key.keyPacket, flags: primarySig?.keyFlags?.[0] ?? 0 })
    for (const sk of key.subkeys) {
      try { await sk.verify(now, config) } catch { continue }
      candidates.push({ packet: sk.keyPacket, flags: newest(sk.bindingSignatures)?.keyFlags?.[0] ?? 0 })
    }

    const out: SshKey[] = []
    for (const { packet, flags } of candidates) {
      if (!(flags & AUTH_FLAG)) continue
      const ssh = sshBlob(packet)
      if (!ssh) continue
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ssh.blob))
      out.push({
        line: `${ssh.type} ${base64(ssh.blob)}`,
        sha256: `SHA256:${base64(digest).replace(/=+$/, '')}`,
        fingerprint: packet.getFingerprint().toUpperCase(),
      })
    }
    return out
  } catch {
    return []
  }
}
