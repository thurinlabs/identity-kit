import type { Attestation } from './types'
import { keyStanding } from './claims'
import { formatClaimDate } from './claimStatus'
import { pgpConfig, readKeyAny, algorithmName, newestSignature, type PgpInput } from './pgp'

/** Why an identity can't take an encrypted message. */
export type EncryptRefusal = 'no-claim' | 'unverified' | 'no-encryption-subkey' | 'encryption-subkey-expired'

export interface EncryptionKey {
  ok: true
  /** The claim that counts; its key is the one to encrypt to. */
  claim: Attestation
  /** The claim's armored public key. */
  key: string
  /** The key or subkey openpgp will encrypt to. */
  subkey: { fingerprint: string; algorithm: string; expires: string | null }
  /** Unix seconds: when this key arrived on the identity (the claim's creation). */
  addedAt: number
  /** Added within `recentDays`: a stolen wallet can only bring in a new key through a new claim. */
  changedRecently: boolean
}

export type EncryptionKeyResult =
  | EncryptionKey
  | { ok: false; reason: EncryptRefusal; claim: Attestation | null; expired?: string | null }

/**
 * The key to encrypt to for an address, from its claims: only the claim that counts (`keyStanding`),
 * and only while an encryption key or subkey is valid. An unverified claim could be someone else's
 * fake claim for the address, so it is never used.
 */
export async function encryptionKeyFor(
  claims: readonly Attestation[],
  { now = Date.now(), recentDays = 7 }: { now?: number; recentDays?: number } = {},
): Promise<EncryptionKeyResult> {
  const standing = keyStanding(claims)
  if (standing.kind === 'none' || standing.kind === 'inactive') return { ok: false, reason: 'no-claim', claim: standing.claim }
  if (standing.kind === 'not-counted' || !standing.claim.pgpPublicKey) return { ok: false, reason: 'unverified', claim: standing.claim }
  const claim = standing.claim
  try {
    const openpgp = await import('openpgp')
    const config = pgpConfig(openpgp)
    const key: any = await readKeyAny(openpgp, claim.pgpPublicKey!)
    const date = new Date(now)
    const enc: any = await key.getEncryptionKey(undefined, date, undefined, config).catch(() => null)
    if (!enc) {
      // Say "expired" only when an encryption subkey exists and every one of them has run out.
      let lastExpiry: number | null = null
      for (const sk of key.subkeys) {
        const flags = newestSignature(sk.bindingSignatures)?.keyFlags?.[0] ?? 0
        if (!(flags & 0x0c) || (await sk.isRevoked(undefined, undefined, date, config).catch(() => false))) continue
        const exp = await sk.getExpirationTime(date, config).catch(() => null)
        if (typeof exp === 'number' || exp instanceof Date) {
          const t = new Date(exp as any).getTime()
          if (t <= now && (lastExpiry === null || t > lastExpiry)) lastExpiry = t
        }
      }
      return lastExpiry !== null
        ? { ok: false, reason: 'encryption-subkey-expired', claim, expired: new Date(lastExpiry).toISOString() }
        : { ok: false, reason: 'no-encryption-subkey', claim }
    }
    const exp = await enc.getExpirationTime(date, config).catch(() => null)
    return {
      ok: true,
      claim,
      key: claim.pgpPublicKey!,
      subkey: {
        fingerprint: enc.getFingerprint().toUpperCase(),
        algorithm: algorithmName(enc),
        expires: exp && exp !== Infinity ? new Date(exp as number).toISOString() : null,
      },
      addedAt: claim.createdAt,
      changedRecently: now / 1000 - claim.createdAt < recentDays * 86_400,
    }
  } catch {
    return { ok: false, reason: 'unverified', claim }
  }
}

/** One plain sentence for a refusal, for the page and the CLI alike. */
export function encryptRefusalText(r: Extract<EncryptionKeyResult, { ok: false }>, formatDate: (iso: string | null | undefined) => string = formatClaimDate): string {
  switch (r.reason) {
    case 'no-claim': return 'No claim counts for this identity, so there is no key to encrypt to.'
    case 'unverified': return "Its newest claim doesn't verify, so its key can't be trusted with a message."
    case 'no-encryption-subkey': return 'Its key has no encryption subkey, so it can sign but not receive.'
    case 'encryption-subkey-expired': return `Its encryption subkey expired on ${formatDate(r.expired)}.`
  }
}

/** The warning to show above Encrypt when the key arrived recently; null otherwise. */
export function keyChangedText(k: EncryptionKey, now: number = Date.now()): string | null {
  if (!k.changedRecently) return null
  const days = Math.floor((now / 1000 - k.addedAt) / 86_400)
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return `This key was added ${when}. If you were expecting a different one, check with them another way.`
}

/**
 * Encrypt text or a file to a public key, with the kit's openpgp config. The recipient is hidden by
 * default (key ID zero, like gpg's --throw-keyids), so an intercepted message doesn't name its
 * recipient; their software tries each of their keys. Text comes back armored; a file as bytes.
 */
export async function encryptTo(
  key: PgpInput,
  data: string | Uint8Array,
  { filename, armor = typeof data === 'string', hideRecipient = true, date = new Date() }:
    { filename?: string; armor?: boolean; hideRecipient?: boolean; date?: Date } = {},
): Promise<string | Uint8Array> {
  const openpgp = await import('openpgp')
  const config = pgpConfig(openpgp)
  const encryptionKeys: any = await readKeyAny(openpgp, key)
  const message: any = typeof data === 'string'
    ? await openpgp.createMessage({ text: data, date })
    : await openpgp.createMessage({ binary: data, filename, format: 'binary', date })
  const opts: any = { message, encryptionKeys, config, wildcard: hideRecipient, date }
  return armor
    ? await openpgp.encrypt({ ...opts, format: 'armored' }) as string
    : await openpgp.encrypt({ ...opts, format: 'binary' }) as Uint8Array
}
