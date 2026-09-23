import { hexToString, stringToHex, type Hex } from 'viem'
import { normalizeFingerprint } from './fingerprint'
import { recordKind } from './authorization'
import { verifyClearsigned } from './pgp'
export { recordKind }

/**
 * Records: one small value per claim per kind, set only by the owner (or by anyone holding
 * the owner's `setRecordFor` authorization), readable by anyone, clearable. The contract looks
 * a record up by kind and cannot list them, so readers ask for the kinds they know.
 *
 * Conventions: kind = keccak256("thurin.<name>"); simple kinds are UTF-8 text, structured
 * kinds small JSON with a `v`, encrypted kinds an armored PGP message; readers ignore unknown
 * fields. Third parties use reverse-dot names (`com.example.thing`) without asking. 1 KB max.
 */
export const MAX_RECORD_BYTES = 1024

/** `thurin.` is the default namespace: kindName('canary') === 'thurin.canary'. Dotted names pass through. */
export function kindName(input: string): string {
  return input.includes('.') ? input : `thurin.${input}`
}

/** Every kind Thurin defines. `thurin.pointer` is the Thurin Labs release list (CLI only; not shown on identity pages). */
export const KNOWN_KINDS = [
  'thurin.railgun', 'thurin.security', 'thurin.successor', 'thurin.affiliation', 'thurin.canary',
  'thurin.private', 'thurin.disclosure', 'thurin.pointer',
] as const
export type KnownKind = (typeof KNOWN_KINDS)[number]

/** The kinds an identity page shows, in display order. */
export const IDENTITY_KINDS: readonly KnownKind[] = [
  'thurin.railgun', 'thurin.security', 'thurin.successor', 'thurin.affiliation', 'thurin.canary',
  'thurin.private', 'thurin.disclosure',
]

export function encodeRecord(value: string): Hex {
  const bytes = new TextEncoder().encode(value).length
  if (bytes > MAX_RECORD_BYTES) throw new Error(`Record is ${bytes} bytes; the registry accepts up to ${MAX_RECORD_BYTES}`)
  return stringToHex(value)
}

export function decodeRecord(hex: Hex): string {
  return hex === '0x' ? '' : hexToString(hex)
}

// ─── thurin.pointer (release list; Thurin Labs' own) ───────────────────────────────────────

export interface PointerEntry { name: string; sha256: string; date: string; url?: string }
export interface PointerRecord { v: 1; releases: PointerEntry[] }

export function parsePointer(text: string): PointerRecord {
  const p = JSON.parse(text)
  if (p?.v !== 1 || !Array.isArray(p.releases)) throw new Error('Not a v1 thurin.pointer record')
  return p
}

/** Add a release, newest first; drop the oldest until it fits the 1 KB slot. */
export function addPointer(existing: PointerRecord | null, entry: PointerEntry): { record: PointerRecord; dropped: PointerEntry[] } {
  if (!/^[0-9a-f]{64}$/i.test(entry.sha256)) throw new Error('sha256 must be 64 hex characters')
  const releases = [entry, ...(existing?.releases ?? []).filter(r => r.name !== entry.name)]
  const dropped: PointerEntry[] = []
  const record: PointerRecord = { v: 1, releases }
  while (new TextEncoder().encode(JSON.stringify(record)).length > MAX_RECORD_BYTES && releases.length > 1) dropped.push(releases.pop()!)
  return { record, dropped }
}

export function renderPointer(p: PointerRecord): string {
  return p.releases.map(r => `${r.name.padEnd(22)} ${r.date}  sha256 ${r.sha256}${r.url ? `  ${r.url}` : ''}`).join('\n')
}

// ─── The user-facing kinds ─────────────────────────────────────────────────────────────────

/** A record as the identity page shows it: what was stored, and what it means if it parses. */
export interface ParsedRecord {
  kind: string
  /** The raw UTF-8 value. */
  text: string
  bytes: number
  /** True when the value has the shape the kind defines. A malformed record is still shown, as text. */
  valid: boolean
  /** Why it is not valid, when it is not. */
  reason?: string
  /** Kind-specific fields, when valid. */
  data: RecordData
}

export type RecordData =
  | { type: 'railgun'; address: string }
  | { type: 'security'; contact: string; url: string | null }
  | { type: 'successor'; fingerprint: string }
  | { type: 'affiliation'; with: string; role: string | null }
  | { type: 'canary'; date: string; statement: string; clearsigned: boolean; verified: boolean | null; reason?: string }
  | { type: 'encrypted'; recipients: number | null }
  | { type: 'pointer'; releases: PointerEntry[] }
  | { type: 'text' }

/** Railgun 0zk addresses: bech32m with the `0zk` prefix (`0zk1…`, 127 chars). Charset and length only; the wallet checks the checksum. */
const RAILGUN_ADDRESS = /^0zk1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{60,200}$/
const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/

/**
 * Parse a record of a known kind. Never throws: a value that does not fit its kind comes back
 * with `valid: false` and a reason, so a page can still show what is there. Pass the claim's
 * `armoredKey` to check clearsigned kinds (`thurin.canary`) against it: `verified` is then
 * true or false, and null when no key was given.
 */
export async function parseRecord(kind: string, text: string, opts: { armoredKey?: string } = {}): Promise<ParsedRecord> {
  const bytes = new TextEncoder().encode(text).length
  const base = { kind, text, bytes }
  const invalid = (reason: string, data: RecordData = { type: 'text' }): ParsedRecord => ({ ...base, valid: false, reason, data })
  const t = text.trim()
  switch (kind) {
    case 'thurin.railgun': {
      if (!RAILGUN_ADDRESS.test(t)) return invalid('Not a 0zk address')
      return { ...base, valid: true, data: { type: 'railgun', address: t } }
    }
    case 'thurin.security': {
      if (!t) return invalid('Empty')
      const url = /^https?:\/\/\S+$/.test(t) ? t : null
      return { ...base, valid: true, data: { type: 'security', contact: t, url } }
    }
    case 'thurin.successor': {
      const fp = normalizeFingerprint(t)
      if (!fp) return invalid('Not a PGP fingerprint')
      return { ...base, valid: true, data: { type: 'successor', fingerprint: fp } }
    }
    case 'thurin.affiliation': {
      try {
        const j = JSON.parse(t)
        if (j?.v !== 1 || typeof j.with !== 'string' || !j.with) return invalid('Not a v1 affiliation: expected {"v":1,"with":"<address or name>"}')
        return { ...base, valid: true, data: { type: 'affiliation', with: j.with, role: typeof j.role === 'string' ? j.role : null } }
      } catch { return invalid('Not JSON') }
    }
    case 'thurin.canary': {
      const date = t.match(ISO_DATE)?.[1]
      if (!date) return invalid('No date in the statement')
      const clearsigned = t.startsWith('-----BEGIN PGP SIGNED MESSAGE-----')
      let statement = clearsigned ? (t.split(/\r?\n\r?\n/)[1] ?? '').split('-----BEGIN PGP SIGNATURE-----')[0].trim() : t
      let verified: boolean | null = null, reason: string | undefined
      if (clearsigned && opts.armoredKey) {
        const v = await verifyClearsigned({ armoredKey: opts.armoredKey, clearsigned: t })
        verified = v.verified; reason = v.reason
        if (v.text) statement = v.text.trim()
      }
      return { ...base, valid: true, data: { type: 'canary', date, statement, clearsigned, verified, ...(reason ? { reason } : {}) } }
    }
    case 'thurin.private':
    case 'thurin.disclosure': {
      if (!t.startsWith('-----BEGIN PGP MESSAGE-----')) return invalid('Not a PGP message')
      let recipients: number | null = null
      try {
        const { readMessage } = await import('openpgp')   // lazy, like pgp.ts: a static import breaks under jsdom
        recipients = (await readMessage({ armoredMessage: t })).getEncryptionKeyIDs().length
      } catch { return invalid('PGP message does not parse') }
      return { ...base, valid: true, data: { type: 'encrypted', recipients } }
    }
    case 'thurin.pointer': {
      try { return { ...base, valid: true, data: { type: 'pointer', releases: parsePointer(t).releases } } }
      catch { return invalid('Not a v1 pointer record') }
    }
    default:
      return { ...base, valid: true, data: { type: 'text' } }
  }
}

/** Minimal client shape: viem's PublicClient has it. */
export interface RecordReader {
  readContract(args: { address: `0x${string}`; abi: unknown; functionName: 'record'; args: readonly [`0x${string}`, bigint, Hex] }): Promise<unknown>
}

/**
 * Read and parse the given kinds on one claim. Kinds with no record are left out.
 * `registry` is the contract address; pass the kit's REGISTRY_ABI.
 */
export async function fetchRecords(
  client: RecordReader, registry: `0x${string}`, abi: unknown,
  owner: `0x${string}`, index: number | bigint, kinds: readonly string[] = IDENTITY_KINDS, opts: { armoredKey?: string } = {},
): Promise<ParsedRecord[]> {
  const out: ParsedRecord[] = []
  for (const kind of kinds) {
    const hex = await client.readContract({ address: registry, abi, functionName: 'record', args: [owner, BigInt(index), recordKind(kind)] }) as Hex
    const text = decodeRecord(hex)
    if (text) out.push(await parseRecord(kind, text, opts))
  }
  return out
}
