import type { Attestation, ClaimCheckKind, PGPVerification } from './types'

/**
 * Plain words for a claim's state, shared by thurin.id, the CLI, and anyone embedding the kit,
 * so every surface says the same thing. `sentence` is for visitors; `fix` is for the owner only
 * (thurin.id shows it when the connected wallet owns the claim).
 */

/** Badge text for each check result. */
export const CLAIM_CHECK_LABEL: Record<ClaimCheckKind, string> = {
  verified: 'pgp verified',
  expired: 'key expired',
  'signing-key-expired': 'signing key expired',
  revoked: 'key revoked',
  compromised: 'key compromised',
  'signing-key-revoked': 'signing key revoked',
  unsupported: 'not supported',
  'bad-signature': "doesn't verify",
}

/** "Mar 5, 2029", in UTC so every viewer sees the same day. */
export function formatClaimDate(isoOrSeconds: string | number | null | undefined): string {
  if (isoOrSeconds === null || isoOrSeconds === undefined) return 'an unknown date'
  const d = typeof isoOrSeconds === 'number' ? new Date(isoOrSeconds * 1000) : new Date(isoOrSeconds)
  if (Number.isNaN(d.getTime())) return 'an unknown date'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function shortFingerprint(fpr: string | null | undefined): string {
  if (!fpr) return 'unknown'
  const f = fpr.toUpperCase()
  return `${f.slice(0, 4)} ${f.slice(4, 8)} …`
}

export interface ClaimCheckText {
  kind: ClaimCheckKind
  label: string
  sentence: string
  /** What the owner can do about it, when there is something. */
  fix: string | null
}

/** Label, visitor sentence, and owner fix for a verification result. */
export function claimCheckText(v: PGPVerification, formatDate: (iso: string | null | undefined) => string = formatClaimDate): ClaimCheckText {
  const kind: ClaimCheckKind = v.kind ?? (v.verified ? 'verified' : 'bad-signature')
  const at = formatDate(v.at)
  const t = (sentence: string, fix: string | null = null): ClaimCheckText => ({ kind, label: CLAIM_CHECK_LABEL[kind], sentence, fix })
  switch (kind) {
    case 'verified':
      return t('The key signed a line naming this address, and the signature checks out.')
    case 'expired':
      return t(`The key on this claim expired on ${at}, so the claim no longer counts.`,
        'Extend the key, then Update key. No new signature needed.')
    case 'signing-key-expired':
      return t(`The subkey that signed this claim (${shortFingerprint(v.signingKey)}) expired on ${at}.`,
        'Extend that subkey, then Update key.')
    case 'revoked':
      return t(`Its owner revoked this PGP key on ${at}${v.revocationReason ? ` (reason: ${v.revocationReason})` : ''}. The claim no longer counts.`,
        'Revoke this claim and attest your new key.')
    case 'compromised':
      return t(`Its owner revoked this PGP key on ${at} as compromised. Don't trust anything it signed after that date.`,
        'Revoke this claim and attest a new key.')
    case 'signing-key-revoked':
      return t(`The subkey that signed this claim was revoked on ${at}.`,
        'Replace the claim with a signature from a current key.')
    case 'unsupported':
      return t(`This key uses an algorithm Thurin doesn't check${v.algorithm ? ` (${v.algorithm})` : ''}. The claim is on-chain, but no lookup will vouch for it.`)
    case 'bad-signature':
    default:
      return t("The signature stored with this claim doesn't match its key, so nothing from this claim is shown.")
  }
}

/** Days until a verified claim's key (or signing subkey) expires, when that is within `withinDays`. */
export function expiresSoon(v: PGPVerification | null | undefined, now: number = Date.now(), withinDays = 30): { days: number; at: string } | null {
  if (!v?.verified || !v.expiresAt) return null
  const ms = new Date(v.expiresAt).getTime() - now
  if (!Number.isFinite(ms) || ms < 0 || ms > withinDays * 86_400_000) return null
  return { days: Math.floor(ms / 86_400_000), at: v.expiresAt }
}

/** "Key expires in 12 days (Mar 6, 2027)." */
export function expiresSoonText(soon: { days: number; at: string }, formatDate: (iso: string) => string = formatClaimDate): string {
  const when = soon.days === 0 ? 'today' : soon.days === 1 ? 'in 1 day' : `in ${soon.days} days`
  return `Key expires ${when} (${formatDate(soon.at)}).`
}

export type ClaimFate =
  | { state: 'active' }
  | { state: 'revoked'; at: number }
  | { state: 'replaced'; at: number; by: number }

/**
 * Active, revoked, or replaced, for each of one owner's claims (keyed by index). `reattest`
 * revokes and attests in one transaction, so a claim revoked at the very second a newer claim
 * of the same owner was created counts as replaced by it. The contract has no "superseded"
 * event; this reads the same fact from the stored timestamps.
 */
export function claimFates(claims: Pick<Attestation, 'index' | 'createdAt' | 'revokedAt'>[]): Map<number, ClaimFate> {
  const out = new Map<number, ClaimFate>()
  for (const c of claims) {
    if (!c.revokedAt) { out.set(c.index, { state: 'active' }); continue }
    const successor = claims
      .filter(n => n.index > c.index && n.createdAt === c.revokedAt)
      .sort((a, b) => a.index - b.index)[0]
    out.set(c.index, successor ? { state: 'replaced', at: c.revokedAt, by: successor.index } : { state: 'revoked', at: c.revokedAt })
  }
  return out
}

/** "Revoked by its owner on Oct 3, 2026." / "Replaced by claim #2 on Oct 3, 2026." */
export function claimFateText(fate: ClaimFate, formatDate: (seconds: number) => string = s => formatClaimDate(s)): string | null {
  if (fate.state === 'revoked') return `Revoked by its owner on ${formatDate(fate.at)}.`
  if (fate.state === 'replaced') return `Replaced by claim #${fate.by} on ${formatDate(fate.at)}.`
  return null
}
