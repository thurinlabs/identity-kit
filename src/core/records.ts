import { normalizeFingerprint } from './fingerprint'
import { recordKind } from './authorization'
import { verifyClearsigned } from './pgp'
export { recordKind }

/**
 * Records: named text values on a claim, set only by the owner (or with the owner's
 * `setRecordFor` permission), readable by anyone, clearable. `recordsOf(owner, index)` lists them.
 *
 * Conventions: simple kinds are text, structured kinds small JSON with a `v`, encrypted kinds an
 * armored PGP message; readers ignore unknown fields. Third parties use reverse-dot names
 * (`com.example.thing`) without asking. 1 KB max.
 */
export const MAX_RECORD_BYTES = 1024
/** Longest record name, `thurin.` included. */
export const MAX_KIND_BYTES = 31

/** `thurin.` is the default namespace: kindName('canary') === 'thurin.canary'. Dotted names pass through. */
export function kindName(input: string): string {
  return input.includes('.') ? input : `thurin.${input}`
}

/** The full record name for `input`, or throws with the registry's rule (a-z 0-9 - . only, 31 bytes). */
export function checkKindName(input: string): string {
  if (!/^[a-z0-9.-]+$/.test(input)) throw new Error(`Record name "${input}": use a-z, 0-9, "-" and "." only`)
  const name = kindName(input)
  if (name.length > MAX_KIND_BYTES) throw new Error(`Record name "${name}" is ${name.length} bytes; the registry allows ${MAX_KIND_BYTES}`)
  return name
}

/** `value` unchanged, or throws if it is over the registry's 1 KB. An empty value clears the record. */
export function checkRecordValue(value: string): string {
  const bytes = new TextEncoder().encode(value).length
  if (bytes > MAX_RECORD_BYTES) throw new Error(`Record is ${bytes} bytes; the registry accepts up to ${MAX_RECORD_BYTES}`)
  return value
}

/** Every kind Thurin defines, in the order an identity page shows them. */
export const KNOWN_KINDS = [
  'thurin.railgun', 'thurin.security', 'thurin.successor', 'thurin.affiliation', 'thurin.canary',
  'thurin.releases', 'thurin.private', 'thurin.disclosure',
] as const
export type KnownKind = (typeof KNOWN_KINDS)[number]

// ─── thurin.releases: the releases an identity put out ─────────────────────────────────────
// Each entry names a release by the sha256 of its checksum file (SHA256SUMS), so the chain says
// "this identity put this out", not only "this key signed it". `thurin record add-release` keeps it.

export interface ReleaseEntry { name: string; sha256: string; date: string; url?: string }
export interface ReleasesRecord { v: 1; releases: ReleaseEntry[] }

export function parseReleases(text: string): ReleasesRecord {
  const p = JSON.parse(text)
  if (p?.v !== 1 || !Array.isArray(p.releases)) throw new Error('Not a v1 thurin.releases record')
  return p
}

/** Add a release, newest first; drop the oldest until it fits the 1 KB slot. */
export function addRelease(existing: ReleasesRecord | null, entry: ReleaseEntry): { record: ReleasesRecord; dropped: ReleaseEntry[] } {
  if (!/^[0-9a-f]{64}$/i.test(entry.sha256)) throw new Error('sha256 must be 64 hex characters')
  const releases = [entry, ...(existing?.releases ?? []).filter(r => r.name !== entry.name)]
  const dropped: ReleaseEntry[] = []
  const record: ReleasesRecord = { v: 1, releases }
  while (new TextEncoder().encode(JSON.stringify(record)).length > MAX_RECORD_BYTES && releases.length > 1) dropped.push(releases.pop()!)
  return { record, dropped }
}

export function renderReleases(p: ReleasesRecord): string {
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
  | { type: 'releases'; releases: ReleaseEntry[] }
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
        const { readMessage } = await import('openpgp')   // lazy, as in pgp.ts: openpgp loads only when needed
        recipients = (await readMessage({ armoredMessage: t })).getEncryptionKeyIDs().length
      } catch { return invalid('PGP message does not parse') }
      return { ...base, valid: true, data: { type: 'encrypted', recipients } }
    }
    case 'thurin.releases': {
      try { return { ...base, valid: true, data: { type: 'releases', releases: parseReleases(t).releases } } }
      catch { return invalid('Not a v1 release list: expected {"v":1,"releases":[…]}') }
    }
    default:
      return { ...base, valid: true, data: { type: 'text' } }
  }
}

/** Anything with viem's `readContract`, such as a viem `PublicClient`. */
export interface RecordReader {
  readContract(args: any): Promise<unknown>
}

/**
 * The records on one claim, from `recordsOf`, as `{ kind, text }` pairs. `kinds` picks and orders
 * them (full names); `null` keeps every record in the order it was first set.
 */
export function pickRecords(names: readonly string[], values: readonly string[], kinds: readonly string[] | null = KNOWN_KINDS): { kind: string; text: string }[] {
  const all = names.map((kind, i) => ({ kind, text: values[i] ?? '' })).filter(r => r.text)
  if (!kinds) return all
  return kinds.flatMap(k => all.filter(r => r.kind === k))
}

/**
 * The records an identity page shows, in page order: Thurin's kinds in their display order, then
 * everyone else's in the order they were first set on the claim. Empty values are left out.
 */
export function pageRecords(names: readonly string[], values: readonly string[]): { kind: string; text: string }[] {
  const all = pickRecords(names, values, null)
  const ours = KNOWN_KINDS.flatMap(k => all.filter(r => r.kind === k))
  return [...ours, ...all.filter(r => !(KNOWN_KINDS as readonly string[]).includes(r.kind))]
}

/** Read and parse the records on one claim. Pass the kit's REGISTRY_ABI. */
export async function fetchRecords(
  client: RecordReader, registry: `0x${string}`, abi: unknown,
  owner: `0x${string}`, index: number | bigint, kinds: readonly string[] | null = KNOWN_KINDS, opts: { armoredKey?: string } = {},
): Promise<ParsedRecord[]> {
  const [names, values] = await client.readContract({ address: registry, abi, functionName: 'recordsOf', args: [owner, BigInt(index)] }) as [string[], string[]]
  const out: ParsedRecord[] = []
  for (const r of pickRecords(names, values, kinds)) out.push(await parseRecord(r.kind, r.text, opts))
  return out
}
