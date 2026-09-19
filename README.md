# @thurinlabs/identity-kit

The shared library for Thurin identity — the single source of truth for looking up and **verifying** on-chain identity claims, PGP key proofs, social proofs, and EFP social graph data. It powers both the [thurin.id](https://thurin.id) explorer and the embeddable `ThurinCard`, so a "verified" result means the same thing everywhere.

Three layers — use whichever fits:

- **Core** — framework-agnostic functions (verify proofs, parse PGP keys, fetch EFP/claims). No React required.
- **Hooks** — thin React wrappers around the core.
- **ThurinCard** — a drop-in identity card UI built on the hooks.

A [Thurin Labs](https://thurin.id) project.

## Install

```bash
npm install @thurinlabs/identity-kit
```

Peer dependencies: `react`, `react-dom`, `wagmi`, `viem`, `@tanstack/react-query`

## Quick Start

```tsx
import { IdentityKitProvider, ThurinCard } from '@thurinlabs/identity-kit'
import '@thurinlabs/identity-kit/styles'

function App() {
  return (
    <IdentityKitProvider>
      <ThurinCard ens="vitalik.eth" theme="thurin" />
    </IdentityKitProvider>
  )
}
```

## ThurinCard

A self-contained identity card that fetches and displays all available identity data.

```tsx
<ThurinCard ens="vitalik.eth" theme="thurin" />
<ThurinCard address="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" theme="dark" />
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `ens` | `string` | — | ENS name to look up |
| `address` | `string` | — | ETH address to look up |
| `theme` | `'thurin' \| 'dark' \| 'light'` | `'thurin'` | Visual theme |

**Displays:** ENS avatar, name, address, on-chain attestation count, verified proof count, EFP follower count, proof provider badges, and a link to the full [thurin.id](https://thurin.id) profile.

## Provider

Wrap your app (or just the part using identity-kit) in `IdentityKitProvider`. If you already have a `WagmiProvider`, the SDK detects it and uses your existing config.

```tsx
// Zero config — uses public RPC, no Farcaster verification
<IdentityKitProvider>
  <ThurinCard ens="vitalik.eth" />
</IdentityKitProvider>

// With options
<IdentityKitProvider
  rpcUrl="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
  neynarApiKey="YOUR_NEYNAR_KEY"
  baseUrl="https://thurin.id"
>
  <ThurinCard ens="vitalik.eth" />
</IdentityKitProvider>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rpcUrl` | `string` | publicnode | Ethereum RPC endpoint. Any RPC works — v2 needs only `eth_call` |
| `neynarApiKey` | `string` | — | Neynar API key for Farcaster proof verification |
| `baseUrl` | `string` | `https://thurin.id` | Base URL for "View on Thurin" links |
| `network` | `'mainnet' \| 'sepolia' \| 'local'` | `'mainnet'` | Which chain to read the PGPRegistry on (`local` = a running anvil) |
| `registryAddress` | `string` | v2 address | Override the registry contract address |

## Hooks

For custom UI, use the hooks directly instead of `ThurinCard`.

### useThurinIdentity

Combined identity data — ENS, on-chain attestations, PGP proofs, and EFP social graph.

```tsx
const identity = useThurinIdentity('vitalik.eth')
// or
const identity = useThurinIdentity('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
```

Returns: `ThurinIdentity` with `address`, `ensName`, `ensAvatar`, `claims`, `totalClaims`, `activeClaims`, `currentFingerprint`, `pgpKeyInfo`, `proofs`, `efp`, `isLoading`, `error`.

### useAttestations

On-chain attestation data from the PGPRegistry v2 contract — the owner's history plus the stored signature and key for each claim, read with plain contract calls (no event logs), each verified off-chain.

```tsx
const { claims, totalClaims, activeClaims, currentFingerprint, isLoading } =
  useAttestations('0xd8dA...')
// claims[].{ index, fingerprint, createdAt, revoked, revokedAt, messageVersion, pgpSignature, pgpPublicKey, verification }
```

### useEFPGraph

EFP (Ethereum Follow Protocol) social graph data.

```tsx
const { efp, isLoading } = useEFPGraph('0xd8dA...')
// efp.followers, efp.following, efp.top8, efp.hasEfp
```

### usePGPProofs

PGP key info and verified social proofs, read from the key stored in the identity's on-chain attestation. No keyserver is consulted.

```tsx
const { keyInfo, proofs, isLoading } = usePGPProofs(fingerprint, attestation.pgpPublicKey)
// proofs[].provider, proofs[].status, proofs[].displayUrl
```

`useThurinIdentity` wires this up for you from the current attestation.

## Core utilities (no React)

The verification and data logic is exported as plain functions — no React, no provider. This is the layer the thurin.id explorer and the hooks both build on; use it directly when you need the validated data behind your own UI.

### Proofs

```ts
import { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref } from '@thurinlabs/identity-kit'

const proof = identifyProof({ name: 'proof@thurin.id', value: 'https://gist.github.com/alice/abc123' })
// → { provider: 'github', label: 'GitHub', user: 'alice', gistId: 'abc123', url }

const result = await verifyProof(proof, fingerprint, neynarApiKey /* only needed for Farcaster */)
// → { verified: boolean, reason?: string }
```

`verifyProof` performs the real check per provider — including confirming the GitHub gist is **owned** by the claimed user, so a proof can't be forged by pointing at someone else's gist ID. `displayUrl` / `proofHref` / `proofSecondaryHref` build the display string and links.

### PGP

```ts
import { parsePgpKey, verifyAttestation, stripEmailUserIDs, hasEmailUserID } from '@thurinlabs/identity-kit'

const keyInfo = await parsePgpKey(armoredKey)
// → { fingerprint, userIDs, algorithm, created, expires, notations, subkeys } | null

const verification = await verifyAttestation({ pgpPublicKey, pgpSignature, fingerprint, ethAddress })
// → { verified: boolean, reason?: string }

// Prepare a key for publishing: drop every user ID that contains an email address.
const stripped = await stripEmailUserIDs(armoredKey)
// → { armored, kept: ['thurin'], removed: ['Alice <alice@example.com>'] } | null (null = nothing would remain)

await hasEmailUserID(armoredKey) // → true if any user ID contains an @
```

**Published identity.** An attestation stores the armored key on-chain, permanently and publicly. Since 0.9.0 the intended shape is a key whose only user ID is a non-email one (any name — `thurin` is the suggestion), carrying the `proof@thurin.id` notations. `stripEmailUserIDs` produces that from a normal export; the stripped key still verifies (`verifyAttestation` needs at least one self-certified user ID, so a key with none is rejected) and keeps the notations on the user ID it retains. Proofs are then read from the on-chain key, never from a keyserver.

`fetchKeyByFingerprint` / `fetchKeyByKeyId` (keys.openpgp.org) remain exported for key-ID → fingerprint resolution, but note that keyserver serves unverified-email keys as bare packets and drops non-email user IDs, so it cannot supply a published identity.

### EFP & claims

```ts
import { fetchEFPGraph } from '@thurinlabs/identity-kit'

const graph = await fetchEFPGraph(address)
// → { followers, following, top8: string[], hasEfp } | null
```

### Contract

```ts
import { REGISTRY_ADDRESS, REGISTRY_ABI, NETWORKS, getRegistry } from '@thurinlabs/identity-kit'

getRegistry('sepolia') // → { chainId: 11155111, address, deployBlock, explorerUrl, defaultRpcUrl }
```

`REGISTRY_ABI` is the complete v2 ABI (reads and writes), so apps that publish claims use the same one. The v2 registry is deployed with CREATE2 and has the same address on every network.

### Fingerprints and key IDs

The v2 registry takes raw fingerprint bytes and indexes by their hash and by long key ID:

```ts
import { fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes } from '@thurinlabs/identity-kit'

fingerprintToBytes('6E00 5391 … 7FE7')  // → '0x6e0053911942a889426c1866e34d9266098f7fe7' (attest / reattest arg)
bytesToFingerprint('0x6e00…7fe7')       // → '6e0053911942a889426c1866e34d9266098f7fe7'
fingerprintHash(fp)                      // → keccak256 of the raw bytes (addressesFor arg)
keyIdOf(fp)                              // → '0xe34d9266098f7fe7' (fingerprintsForKeyId arg; v4 = last 8 bytes, v6 = first 8, per RFC 9580)
```

### Authorized writes (EIP-712)

Every write has a `…For` twin that anyone can submit with the owner's signature — for cold wallets, a CLI, or a sponsor. The helpers build exactly the typed data the contract verifies:

```ts
import { attestTypedData, authorizationDigest } from '@thurinlabs/identity-kit'
import { signTypedData } from '@wagmi/core'

const nonce = await readContract({ ..., functionName: 'nonces', args: [owner] })
const typedData = attestTypedData(chainId, registryAddress, {
  owner, fingerprint, pgpSignature, pgpPublicKey, nonce, deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
})
const signature = await signTypedData(config, typedData)
// anyone: attestFor(owner, fingerprintBytes, sigBytes, keyBytes, deadline, signature)
```

Also `reattestTypedData`, `updateKeyTypedData`, `revokeTypedData`, `setRecordTypedData`, and `recordKind(name)` for the `bytes32 kind` of a record.

## Themes

Three built-in themes: `thurin`, `dark`, `light`. All styles are scoped under `[data-thurin-theme]` with `thurin-` prefixed class names to avoid conflicts with your app's styles.

Import styles when using `ThurinCard`:

```tsx
import '@thurinlabs/identity-kit/styles'
```

Hooks-only consumers don't need to import styles.

## Embed (No React Required)

For static sites, Jekyll blogs, WordPress, or any HTML page — use the standalone embed script. Everything runs client-side; there's no Thurin backend in the path.

```html
<div
  data-thurin-card="bendoubleu.eth"
  data-theme="thurin"
  data-rpc-url="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
></div>

<script src="https://cdn.jsdelivr.net/npm/@thurinlabs/identity-kit@0/dist/embed.global.js"></script>
```

| Attribute | Description |
|-----------|-------------|
| `data-thurin-card` | ENS name or ETH address to look up (required) |
| `data-theme` | `thurin`, `dark`, or `light` (default: `thurin`). Change it after render and the card follows, so a page with a theme switch can keep the card in step. |
| `data-rpc-url` | Optional. Any Ethereum RPC; the card reads the v2 registry with plain calls, so the keyless public default works. |
| `data-neynar-key` | Optional. A Neynar API key, only to verify Farcaster proofs. Without it, Farcaster shows as unverified. |
| `data-base-url` | Optional. Where the card's "View on Thurin" link points (default `https://thurin.id`). A page served from ENS can pass its own name so the link stays on ENS. |
| `data-network` | Optional. `sepolia` or `local` instead of mainnet. |
| `data-registry-address` | Optional. Override the registry contract address. |

The card talks directly to Ethereum and each proof platform — no intermediary, no keyserver. Cards render automatically on page load and for dynamically added elements.

## Supported Proof Providers

| Provider | Proof Method |
|----------|-------------|
| GitHub | Public gist, or a repository description (the form an organisation can use) |
| DNS | TXT record |
| Farcaster | Public cast (requires Neynar API key) |
| Codeberg | Repository description |
| Mastodon | Profile metadata |

## How a claim is verified

`verifyAttestation` checks three things: the stored key's fingerprint is the one on the claim; the stored clearsigned statement was made by that key (or one of its bound signing subkeys) and has not been altered; and the statement names the claim's address. Key validity is judged **now**, the way gpg does it: the key must currently be bound, unrevoked, and unexpired. It is deliberately not judged at the instant the signature was made, which is openpgp.js's default. That default rejects a perfectly good claim whenever the key's newest self-certification postdates the attest signature, which is exactly what happens when you add a proof after attesting and export with `export-minimal` (1.0.3).

## Key algorithms

Any curve openpgp.js can compute is accepted: Ed25519, Cv25519, NIST P-256/384/521, brainpool, RSA, and **secp256k1**. openpgp.js rejects secp256k1 by default because RFC 9580 does not list it; identity-kit turns that rejection off, since it is a compatibility rule, not a security one. A secp256k1 PGP key doubles as an Ethereum key (the address is derived from the same public point), so anything that can sign with the PGP key can sign Ethereum transactions: hold such a key if you like, but do not fund its derived address. In Node, openpgp.js needs the `eckey-utils` package for this curve; identity-kit depends on it, so `npm install` brings it in. The browser build needs nothing extra.

## Migrating from 0.9.x

1.0.0 reads the **PGPRegistry v2** contract. The v1 registry is no longer read.

| 0.9.x | 1.0.0 |
|-------|-------|
| `REGISTRY_ABI` (v1, reads only) | v2 ABI, reads + writes |
| `CONTRACT_DEPLOY_BLOCK` | removed (no log scans) |
| `Attestation.txHash` | removed; `revokedAt` and `messageVersion` added |
| `rpcUrl` needed `eth_getLogs` | any RPC |
| — | `local` network, `registryAddress` prop / `data-registry-address` |
| — | fingerprint helpers, EIP-712 authorization helpers |

## Migrating from 0.8.x

0.9.0 moves proofs to the on-chain key and adds key-preparation helpers.

| 0.8.x | 0.9.0 |
|-------|-------|
| `usePGPProofs(fingerprint)` — fetched the key from keys.openpgp.org | `usePGPProofs(fingerprint, armoredKey)` — parses the supplied (on-chain) key |
| — | `stripEmailUserIDs(armoredKey)`, `hasEmailUserID(armoredKey)` |
| mainnet only | `network` prop / `data-network` attribute; `NETWORKS`, `getRegistry()` |

`useThurinIdentity`, `ThurinCard`, and the embed need no changes; they pass the attestation's key through automatically.

## Migrating from 0.7.x

0.8.0 collapses the Scry / Signet sub-brands into Thurin. Renames only — no behaviour changed, and existing on-chain attestations verify exactly as before.

| 0.7.x | 0.8.0 |
|-------|-------|
| `ScryCard` / `ScryCardProps` | `ThurinCard` / `ThurinCardProps` |
| `useScryIdentity` | `useThurinIdentity` |
| `useSignetClaims` | `useAttestations` |
| `ScryIdentity` (type) | `ThurinIdentity` |
| `SignetClaim` (type) | `Attestation` |
| `scryBaseUrl` (provider prop) | `baseUrl` |
| `data-scry-card` (embed) | `data-thurin-card` |
| `[data-scry-theme]`, `.scry-*`, `--scry-*` | `[data-thurin-theme]`, `.thurin-*`, `--thurin-*` |
| `ScryEmbed` (IIFE global) | `ThurinEmbed` |

## Development

```bash
npm install
npm run build
npm test
```

## Links

- [Thurin](https://thurin.id) — Identity explorer
- [Attest](https://thurin.id/attest) — Create identity claims
- [Documentation](https://docs.thurin.id)
- [GitHub](https://github.com/thurinlabs/identity-kit)
- [Codeberg](https://codeberg.org/thurinlabs/identity-kit)

## License

MIT
