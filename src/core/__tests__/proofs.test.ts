import { describe, it, expect, vi, beforeEach } from 'vitest'
import { identifyProof, displayUrl, proofHref, proofSecondaryHref, verifyProof } from '../proofs'

describe('identifyProof', () => {
  it('returns null for non-proof notations', () => {
    expect(identifyProof({ name: 'other@example.com', value: 'test' })).toBeNull()
  })

  it('identifies GitHub gist proofs', () => {
    const result = identifyProof({
      name: 'proof@thurin.id',
      value: 'https://gist.github.com/alice/abc123def456',
    })
    expect(result).toMatchObject({
      provider: 'github',
      label: 'GitHub',
      user: 'alice',
      gistId: 'abc123def456',
    })
  })

  it('identifies DNS proofs', () => {
    const result = identifyProof({
      name: 'proof@thurin.id',
      value: 'dns:example.com?type=TXT',
    })
    expect(result).toMatchObject({
      provider: 'dns',
      label: 'DNS',
      domain: 'example.com',
    })
  })

  it('identifies Farcaster proofs', () => {
    const result = identifyProof({
      name: 'proof@thurin.id',
      value: 'https://farcaster.xyz/alice/0xabc123',
    })
    expect(result).toMatchObject({
      provider: 'farcaster',
      label: 'Farcaster',
      user: 'alice',
      castHash: '0xabc123',
    })
  })

  it('identifies Codeberg proofs', () => {
    const result = identifyProof({
      name: 'proof@thurin.id',
      value: 'https://codeberg.org/alice/thurin-proof',
    })
    expect(result).toMatchObject({
      provider: 'codeberg',
      label: 'Codeberg',
      user: 'alice',
      repo: 'thurin-proof',
    })
  })

  it('identifies Mastodon proofs', () => {
    const result = identifyProof({
      name: 'proof@thurin.id',
      value: 'https://mastodon.social/@alice',
    })
    expect(result).toMatchObject({
      provider: 'mastodon',
      label: 'Mastodon',
      instance: 'mastodon.social',
      user: 'alice',
    })
  })

  it('returns unknown for unrecognized URLs', () => {
    const result = identifyProof({
      name: 'proof@thurin.id',
      value: 'https://unknown.example.com/something',
    })
    expect(result).toMatchObject({
      provider: 'unknown',
      label: 'Unknown',
    })
  })
})

describe('displayUrl', () => {
  it('shows domain for DNS', () => {
    expect(displayUrl({ provider: 'dns', label: 'DNS', url: '', domain: 'example.com' })).toBe('example.com')
  })

  it('shows username for GitHub', () => {
    expect(displayUrl({ provider: 'github', label: 'GitHub', url: '', user: 'alice' })).toBe('alice')
  })

  it('shows @user for Farcaster', () => {
    expect(displayUrl({ provider: 'farcaster', label: 'Farcaster', url: '', user: 'alice' })).toBe('@alice')
  })

  it('shows username for Codeberg', () => {
    expect(displayUrl({ provider: 'codeberg', label: 'Codeberg', url: '', user: 'alice' })).toBe('alice')
  })

  it('shows full handle for Mastodon', () => {
    expect(displayUrl({ provider: 'mastodon', label: 'Mastodon', url: '', user: 'alice', instance: 'mastodon.social' })).toBe('@alice@mastodon.social')
  })
})

describe('proofHref', () => {
  it('returns profile URL for GitHub', () => {
    expect(proofHref({ provider: 'github', label: 'GitHub', url: '', user: 'alice' })).toBe('https://github.com/alice')
  })

  it('returns profile URL for Mastodon', () => {
    expect(proofHref({ provider: 'mastodon', label: 'Mastodon', url: '', user: 'alice', instance: 'mastodon.social' })).toBe('https://mastodon.social/@alice')
  })

  it('returns null for non-http unknown providers', () => {
    expect(proofHref({ provider: 'unknown', label: 'Unknown', url: 'not-a-url' })).toBeNull()
  })
})

describe('proofSecondaryHref', () => {
  it('returns proof URL for GitHub', () => {
    const url = 'https://gist.github.com/alice/123'
    expect(proofSecondaryHref({ provider: 'github', label: 'GitHub', url })).toBe(url)
  })

  it('returns null for DNS', () => {
    expect(proofSecondaryHref({ provider: 'dns', label: 'DNS', url: '' })).toBeNull()
  })
})

describe('verifyProof', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns skipped for Farcaster without API key', async () => {
    const proof = { provider: 'farcaster', label: 'Farcaster', url: '', user: 'alice', castHash: '0xabc' }
    const result = await verifyProof(proof, 'ABCD1234')
    expect(result.verified).toBe(false)
    expect(result.reason).toContain('Neynar API key')
  })

  it('returns unverified for unknown provider', async () => {
    const proof = { provider: 'unknown', label: 'Unknown', url: '' }
    const result = await verifyProof(proof, 'ABCD1234')
    expect(result.verified).toBe(false)
    expect(result.reason).toBe('Unknown provider')
  })

  it('verifies GitHub gist with matching fingerprint', async () => {
    const fingerprint = '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8'
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: { 'proof.md': { content: `openpgp4fpr:${fingerprint}` } },
      }),
    } as Response)

    const proof = { provider: 'github', label: 'GitHub', url: '', user: 'alice', gistId: 'abc123' }
    const result = await verifyProof(proof, fingerprint)
    expect(result.verified).toBe(true)
  })

  it('rejects GitHub gist without matching fingerprint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: { 'proof.md': { content: 'openpgp4fpr:WRONG' } },
      }),
    } as Response)

    const proof = { provider: 'github', label: 'GitHub', url: '', user: 'alice', gistId: 'abc123' }
    const result = await verifyProof(proof, '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8')
    expect(result.verified).toBe(false)
  })

  it('verifies DNS TXT record', async () => {
    const fingerprint = '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8'
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: [{ data: `"openpgp4fpr:${fingerprint}"` }],
      }),
    } as Response)

    const proof = { provider: 'dns', label: 'DNS', url: '', domain: 'example.com' }
    const result = await verifyProof(proof, fingerprint)
    expect(result.verified).toBe(true)
  })

  it('verifies Mastodon profile with fingerprint in field', async () => {
    const fingerprint = '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8'
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fields: [{ value: `<a href="https://scry.thurin.id/#/pgp/${fingerprint}">scry.thurin.id/#/pgp/${fingerprint}</a>` }],
        note: '',
      }),
    } as Response)

    const proof = { provider: 'mastodon', label: 'Mastodon', url: '', instance: 'mastodon.social', user: 'alice' }
    const result = await verifyProof(proof, fingerprint)
    expect(result.verified).toBe(true)
  })

  it('verifies Mastodon profile with key ID in field', async () => {
    const fingerprint = '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8'
    const keyId = fingerprint.slice(-16)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fields: [{ value: `<a href="https://scry.thurin.id/#/pgp/${keyId}">scry.thurin.id/#/pgp/${keyId}</a>` }],
        note: '',
      }),
    } as Response)

    const proof = { provider: 'mastodon', label: 'Mastodon', url: '', instance: 'mastodon.social', user: 'alice' }
    const result = await verifyProof(proof, fingerprint)
    expect(result.verified).toBe(true)
  })

  it('verifies Codeberg repo description', async () => {
    const fingerprint = '03E53D807CE38C130ED42ECECD3D0D7F0C9E5FB8'
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        description: `thurin-id=openpgp4fpr:${fingerprint}`,
      }),
    } as Response)

    const proof = { provider: 'codeberg', label: 'Codeberg', url: '', user: 'alice', repo: 'thurin-proof' }
    const result = await verifyProof(proof, fingerprint)
    expect(result.verified).toBe(true)
  })
})
