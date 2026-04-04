import type { Notation, Proof, PGPVerification } from './types'

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
    provider: 'dns',
    label: 'DNS',
    pattern: /^dns:([^?]+)\?type=TXT$/i,
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
    pattern: /^https:\/\/([^/]+)\/@([^/]+)$/i,
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
  try {
    const resp = await fetch(`https://api.github.com/gists/${proof.gistId}`)
    if (!resp.ok) return { verified: false, reason: `GitHub API returned ${resp.status}` }
    const data = await resp.json()

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

async function verifyDNS(proof: Proof, fingerprint: string): Promise<PGPVerification> {
  try {
    const resp = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(proof.domain!)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' } },
    )
    if (!resp.ok) return { verified: false, reason: `DNS query returned ${resp.status}` }
    const data = await resp.json()

    for (const answer of data.Answer || []) {
      if (answer.data && containsFingerprint(answer.data, fingerprint)) {
        return { verified: true }
      }
    }
    return { verified: false, reason: 'Fingerprint token not found in TXT records' }
  } catch (err: any) {
    return { verified: false, reason: `DNS fetch failed: ${err.message}` }
  }
}

const NEYNAR_HUB = 'https://hub-api.neynar.com'

async function resolveFid(
  username: string,
  apiKey: string,
): Promise<number | null> {
  const resp = await fetch(
    `${NEYNAR_HUB}/v1/userNameProofByName?name=${encodeURIComponent(username)}`,
    { headers: { 'x-api-key': apiKey } },
  )
  if (!resp.ok) return null
  const data = await resp.json()
  return data.fid ?? null
}

async function verifyFarcaster(
  proof: Proof,
  fingerprint: string,
  neynarApiKey?: string,
): Promise<PGPVerification> {
  if (!neynarApiKey) {
    return { verified: false, reason: 'Farcaster verification requires a Neynar API key' }
  }

  try {
    const fid = await resolveFid(proof.user!, neynarApiKey)
    if (!fid) return { verified: false, reason: `Could not resolve Farcaster user "${proof.user}"` }

    const headers = { 'x-api-key': neynarApiKey }
    let pageToken = ''
    for (let page = 0; page < 5; page++) {
      const url = `${NEYNAR_HUB}/v1/castsByFid?fid=${fid}&pageSize=100&reverse=true${pageToken ? `&pageToken=${pageToken}` : ''}`
      const resp = await fetch(url, { headers })
      if (!resp.ok) return { verified: false, reason: `Farcaster Hub returned ${resp.status}` }
      const data = await resp.json()

      for (const msg of data.messages || []) {
        if (msg.hash && msg.hash.startsWith(proof.castHash!)) {
          const text = msg.data?.castAddBody?.text || ''
          if (containsFingerprint(text, fingerprint)) {
            return { verified: true }
          }
          return { verified: false, reason: 'Cast found but fingerprint token not in text' }
        }
      }

      if (!data.nextPageToken) break
      pageToken = data.nextPageToken
    }

    return { verified: false, reason: 'Cast not found' }
  } catch (err: any) {
    return { verified: false, reason: `Farcaster fetch failed: ${err.message}` }
  }
}

async function verifyCodeberg(proof: Proof, fingerprint: string): Promise<PGPVerification> {
  try {
    const resp = await fetch(
      `https://codeberg.org/api/v1/repos/${encodeURIComponent(proof.user!)}/${encodeURIComponent(proof.repo!)}`,
    )
    if (!resp.ok) return { verified: false, reason: `Codeberg API returned ${resp.status}` }
    const data = await resp.json()

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
    const resp = await fetch(
      `https://${proof.instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(proof.user!)}`,
    )
    if (!resp.ok) return { verified: false, reason: `Mastodon API returned ${resp.status}` }
    const data = await resp.json()

    const keyId = fingerprint.slice(-16)

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

type Verifier = (proof: Proof, fingerprint: string, neynarApiKey?: string) => Promise<PGPVerification>

const verifiers: Record<string, Verifier> = {
  github: verifyGitHub,
  dns: verifyDNS,
  farcaster: verifyFarcaster,
  codeberg: verifyCodeberg,
  mastodon: verifyMastodon,
}

export async function verifyProof(
  proof: Proof,
  fingerprint: string,
  neynarApiKey?: string,
): Promise<PGPVerification> {
  const fn = verifiers[proof.provider]
  if (!fn) return { verified: false, reason: 'Unknown provider' }
  return fn(proof, fingerprint, neynarApiKey)
}
