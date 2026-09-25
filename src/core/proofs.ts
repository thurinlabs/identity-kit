import { keyIdHex } from './fingerprint'
import type { Notation, Proof, PGPVerification } from './types'

// Every outside request says nothing about the page that made it, even on a site whose own
// referrer policy would.
const get = (url: string, init: RequestInit = {}) => fetch(url, { referrerPolicy: 'no-referrer', ...init })

const PROVIDERS: {
  provider: string
  label: string
  pattern: RegExp
  parse: (m: RegExpMatchArray) => Record<string, string>
}[] = [
  {
    provider: 'github',
    label: 'GitHub',
    pattern: /^https:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)$/i,
    parse: (m) => ({ user: m[1], gistId: m[2] }),
  },
  {
    // A repository's description: the form an organisation can use, since gists belong to user
    // accounts only. Same shape as the Codeberg proof.
    provider: 'github',
    label: 'GitHub',
    pattern: /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/i,
    parse: (m) => ({ user: m[1], repo: m[2] }),
  },
  {
    provider: 'dns',
    label: 'DNS',
    // A hostname only; underscores allowed for names like _thurin.example.com.
    pattern: /^dns:([a-z0-9._-]+)\?type=TXT$/i,
    parse: (m) => ({ domain: m[1] }),
  },
  {
    provider: 'farcaster',
    label: 'Farcaster',
    pattern: /^https:\/\/farcaster\.xyz\/([^/]+)\/(0x[a-f0-9]+)$/i,
    parse: (m) => ({ user: m[1], castHash: m[2] }),
  },
  {
    provider: 'codeberg',
    label: 'Codeberg',
    pattern: /^https:\/\/codeberg\.org\/([^/]+)\/([^/]+)$/i,
    parse: (m) => ({ user: m[1], repo: m[2] }),
  },
  {
    provider: 'mastodon',
    label: 'Mastodon',
    // A bare hostname (optional port), so "mastodon.social@evil.com" can't send the lookup elsewhere.
    pattern: /^https:\/\/([a-z0-9.-]+(?::\d+)?)\/@([^/@?#\s]+)$/i,
    parse: (m) => ({ instance: m[1], user: m[2] }),
  },
]

export function identifyProof(notation: Notation): Proof | null {
  if (notation.name !== 'proof@thurin.id') return null

  for (const { provider, label, pattern, parse } of PROVIDERS) {
    const m = notation.value.match(pattern)
    if (m) {
      return { provider, label, url: notation.value, ...parse(m) }
    }
  }

  return { provider: 'unknown', label: 'Unknown', url: notation.value }
}

export function displayUrl(proof: Proof): string {
  if (proof.provider === 'dns') return proof.domain!
  if (proof.provider === 'github') return proof.user!
  if (proof.provider === 'farcaster') return `@${proof.user}`
  if (proof.provider === 'codeberg') return proof.user!
  if (proof.provider === 'mastodon') return `@${proof.user}@${proof.instance}`
  return proof.url
}

export function proofHref(proof: Proof): string | null {
  if (proof.provider === 'dns') return `https://${proof.domain}`
  if (proof.provider === 'github') return `https://github.com/${proof.user}`
  if (proof.provider === 'farcaster') return `https://farcaster.xyz/${proof.user}`
  if (proof.provider === 'codeberg') return `https://codeberg.org/${proof.user}`
  if (proof.provider === 'mastodon') return `https://${proof.instance}/@${proof.user}`
  if (proof.url.startsWith('http')) return proof.url
  return null
}

export function proofSecondaryHref(proof: Proof): string | null {
  if (proof.provider === 'github') return proof.url
  if (proof.provider === 'farcaster') return proof.url
  if (proof.provider === 'codeberg') return proof.url
  if (proof.provider === 'mastodon') return proof.url
  return null
}

// ─── Verification ──────────────────────────────────────────────────────────

const FPR_TOKEN = 'OPENPGP4FPR:'

function containsFingerprint(text: string, fingerprint: string): boolean {
  return text.toUpperCase().includes(FPR_TOKEN + fingerprint.toUpperCase())
}

function containsFingerprintUrl(text: string, fingerprint: string): boolean {
  return text.toUpperCase().includes(fingerprint.toUpperCase())
}

async function verifyGitHub(proof: Proof, fingerprint: string): Promise<PGPVerification> {
  if (proof.repo) return verifyGitHubRepo(proof, fingerprint)
  try {
    const resp = await get(`https://api.github.com/gists/${proof.gistId}`)
    if (!resp.ok) return { verified: false, reason: `GitHub API returned ${resp.status}` }
    const data = await resp.json()

    // A gist URL works under any username, so check the gist's real owner.
    if (data.owner?.login?.toLowerCase() !== proof.user!.toLowerCase()) {
      return { verified: false, reason: 'Gist owner does not match claimed user' }
    }

    for (const file of Object.values(data.files || {}) as any[]) {
      if (file.content && containsFingerprint(file.content, fingerprint)) {
        return { verified: true }
      }
    }
    return { verified: false, reason: 'Fingerprint token not found in gist' }
  } catch (err: any) {
    return { verified: false, reason: `GitHub fetch failed: ${err.message}` }
  }
}

async function verifyGitHubRepo(proof: Proof, fingerprint: string): Promise<PGPVerification> {
  try {
    const resp = await get(
      `https://api.github.com/repos/${encodeURIComponent(proof.user!)}/${encodeURIComponent(proof.repo!)}`,
    )
    if (!resp.ok) return { verified: false, reason: `GitHub API returned ${resp.status}` }
    const data = await resp.json()

    // GitHub follows renames, so the API can answer for a repo under another owner.
    if (data.owner?.login?.toLowerCase() !== proof.user!.toLowerCase()) {
      return { verified: false, reason: 'Repository owner does not match claimed account' }
    }

    if (data.description && containsFingerprint(data.description, fingerprint)) {
      return { verified: true }
    }
    return { verified: false, reason: 'Fingerprint token not found in repository description' }
  } catch (err: any) {
    return { verified: false, reason: `GitHub fetch failed: ${err.message}` }
  }
}

async function verifyDNS(proof: Proof, fingerprint: string): Promise<PGPVerification> {
  try {
    const resp = await get(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(proof.domain!)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' } },
    )
    if (!resp.ok) return { verified: false, reason: `DNS query returned ${resp.status}` }
    const data = await resp.json()

    for (const answer of data.Answer || []) {
      // TXT answers only (type 16): a CNAME in the chain must not match.
      if (answer.type !== 16) continue
      if (answer.data && containsFingerprint(answer.data, fingerprint)) {
        return { verified: true }
      }
    }
    return { verified: false, reason: 'Fingerprint token not found in TXT records' }
  } catch (err: any) {
    return { verified: false, reason: `DNS fetch failed: ${err.message}` }
  }
}

/**
 * Farcaster proofs are read from a Farcaster node's HTTP API (`/v1/userNameProofByName`,
 * `/v1/castsByFid`). The default is Quilibrium's public Hypersnap node, which needs no key and
 * allows browser requests; it sees the visitor's IP and which account was checked. Point
 * `farcasterHub` at your own node to avoid that, or pass a Neynar key to use Neynar's hub.
 */
export const FARCASTER_HUB = 'https://haatz.quilibrium.com'
const NEYNAR_HUB = 'https://hub-api.neynar.com'

export interface ProofOptions {
  /** A Farcaster node's HTTP API base URL. Default: FARCASTER_HUB (keyless). */
  farcasterHub?: string
  /** Optional: read Farcaster through Neynar's hub with this key instead. */
  neynarApiKey?: string
}

function farcasterSource(opts: ProofOptions): { base: string; headers: Record<string, string> } {
  if (opts.farcasterHub) return { base: opts.farcasterHub.replace(/\/+$/, ''), headers: {} }
  if (opts.neynarApiKey) return { base: NEYNAR_HUB, headers: { 'x-api-key': opts.neynarApiKey } }
  return { base: FARCASTER_HUB, headers: {} }
}

async function verifyFarcaster(
  proof: Proof,
  fingerprint: string,
  opts: ProofOptions = {},
): Promise<PGPVerification> {
  const { base, headers } = farcasterSource(opts)
  const host = base.replace(/^https?:\/\//, '')
  try {
    const nameResp = await get(`${base}/v1/userNameProofByName?name=${encodeURIComponent(proof.user!)}`, { headers })
    if (nameResp.status === 404) return { verified: false, reason: `Could not resolve Farcaster user "${proof.user}"` }
    if (!nameResp.ok) return { verified: false, reason: `Couldn't check: the Farcaster node (${host}) returned ${nameResp.status}` }
    const fid = (await nameResp.json()).fid
    if (!fid) return { verified: false, reason: `Could not resolve Farcaster user "${proof.user}"` }

    let pageToken = ''
    for (let page = 0; page < 5; page++) {
      const url = `${base}/v1/castsByFid?fid=${fid}&pageSize=100&reverse=true${pageToken ? `&pageToken=${pageToken}` : ''}`
      const resp = await get(url, { headers })
      if (!resp.ok) return { verified: false, reason: `Couldn't check: the Farcaster node (${host}) returned ${resp.status}` }
      const data = await resp.json()

      for (const msg of data.messages || []) {
        if (msg.hash && msg.hash.startsWith(proof.castHash!)) {
          const text = msg.data?.castAddBody?.text || ''
          if (containsFingerprint(text, fingerprint)) {
            return { verified: true }
          }
          // A short hash prefix can match several casts; keep looking.
        }
      }

      if (!data.nextPageToken) break
      pageToken = data.nextPageToken
    }

    return { verified: false, reason: 'Cast not found' }
  } catch (err: any) {
    return { verified: false, reason: `Couldn't check: the Farcaster node (${host}) didn't answer (${err.message})` }
  }
}

async function verifyCodeberg(proof: Proof, fingerprint: string): Promise<PGPVerification> {
  try {
    const resp = await get(
      `https://codeberg.org/api/v1/repos/${encodeURIComponent(proof.user!)}/${encodeURIComponent(proof.repo!)}`,
    )
    if (!resp.ok) return { verified: false, reason: `Codeberg API returned ${resp.status}` }
    const data = await resp.json()
    // A renamed or transferred repository can answer under a different owner than the URL names.
    if (data.owner?.login?.toLowerCase() !== proof.user!.toLowerCase()) {
      return { verified: false, reason: 'Repository owner does not match claimed account' }
    }

    if (data.description && containsFingerprint(data.description, fingerprint)) {
      return { verified: true }
    }

    return { verified: false, reason: 'Fingerprint token not found in repo description' }
  } catch (err: any) {
    return { verified: false, reason: `Codeberg fetch failed: ${err.message}` }
  }
}

async function verifyMastodon(proof: Proof, fingerprint: string): Promise<PGPVerification> {
  try {
    // Checked again: the host goes straight into the request URL.
    if (!proof.instance || !/^[a-z0-9.-]+(?::\d+)?$/i.test(proof.instance)) {
      return { verified: false, reason: 'Invalid Mastodon instance host' }
    }
    const resp = await get(
      `https://${proof.instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(proof.user!)}`,
    )
    if (!resp.ok) return { verified: false, reason: `Mastodon API returned ${resp.status}` }
    const data = await resp.json()

    const keyId = keyIdHex(fingerprint.replace(/^0x/i, '').replace(/\s+/g, '').toLowerCase())

    for (const field of data.fields || []) {
      const text = field.value.replace(/<[^>]*>/g, '')
      if (containsFingerprintUrl(text, fingerprint) || containsFingerprintUrl(text, keyId)) {
        return { verified: true }
      }
    }

    if (data.note) {
      const text = data.note.replace(/<[^>]*>/g, '')
      if (containsFingerprintUrl(text, fingerprint) || containsFingerprintUrl(text, keyId)) {
        return { verified: true }
      }
    }

    return { verified: false, reason: 'Fingerprint not found in profile fields or bio' }
  } catch (err: any) {
    return { verified: false, reason: `Mastodon fetch failed: ${err.message}` }
  }
}

type Verifier = (proof: Proof, fingerprint: string, opts?: ProofOptions) => Promise<PGPVerification>

const verifiers: Record<string, Verifier> = {
  github: verifyGitHub,
  dns: verifyDNS,
  farcaster: verifyFarcaster,
  codeberg: verifyCodeberg,
  mastodon: verifyMastodon,
}

/** Check one proof against its platform. `options` may also be a Neynar API key. */
export async function verifyProof(
  proof: Proof,
  fingerprint: string,
  opts?: ProofOptions | string,
): Promise<PGPVerification> {
  const fn = verifiers[proof.provider]
  if (!fn) return { verified: false, reason: 'Unknown provider' }
  return fn(proof, fingerprint, typeof opts === 'string' ? { neynarApiKey: opts } : (opts ?? {}))
}
