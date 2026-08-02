# @thurinlabs/identity-kit

The shared library for Thurin identity — the single source of truth for looking up and **verifying** on-chain identity claims, PGP key proofs, social proofs, and EFP social graph data. It powers both the [Scry](https://thurin.id) explorer and the embeddable `ScryCard`, so a "verified" result means the same thing everywhere.

Three layers — use whichever fits:

- **Core** — framework-agnostic functions (verify proofs, parse PGP keys, fetch EFP/claims). No React required.
- **Hooks** — thin React wrappers around the core.
- **ScryCard** — a drop-in identity card UI built on the hooks.

A [Thurin Labs](https://thurin.id) project.

## Install

```bash
npm install @thurinlabs/identity-kit
```

Peer dependencies: `react`, `react-dom`, `wagmi`, `viem`, `@tanstack/react-query`

## Quick Start

```tsx
import { IdentityKitProvider, ScryCard } from '@thurinlabs/identity-kit'
import '@thurinlabs/identity-kit/styles'

function App() {
  return (
    <IdentityKitProvider>
      <ScryCard ens="vitalik.eth" theme="thurin" />
    </IdentityKitProvider>
  )
}
```

## ScryCard

A self-contained identity card that fetches and displays all available identity data.

```tsx
<ScryCard ens="vitalik.eth" theme="thurin" />
<ScryCard address="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" theme="dark" />
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `ens` | `string` | — | ENS name to look up |
| `address` | `string` | — | ETH address to look up |
| `theme` | `'thurin' \| 'dark' \| 'light'` | `'thurin'` | Visual theme |

**Displays:** ENS avatar, name, address, Signet seal count, verified proof count, EFP follower count, proof provider badges, and a link to the full [Scry](https://thurin.id) profile.

## Provider

Wrap your app (or just the part using identity-kit) in `IdentityKitProvider`. If you already have a `WagmiProvider`, the SDK detects it and uses your existing config.

```tsx
// Zero config — uses public RPC, no Farcaster verification
<IdentityKitProvider>
  <ScryCard ens="vitalik.eth" />
</IdentityKitProvider>

// With options
<IdentityKitProvider
  rpcUrl="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
  neynarApiKey="YOUR_NEYNAR_KEY"
  scryBaseUrl="https://thurin.id"
>
  <ScryCard ens="vitalik.eth" />
</IdentityKitProvider>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rpcUrl` | `string` | publicnode | Ethereum RPC endpoint |
| `neynarApiKey` | `string` | — | Neynar API key for Farcaster proof verification |
| `scryBaseUrl` | `string` | `https://thurin.id` | Base URL for "View on Scry" links |

## Hooks

For custom UI, use the hooks directly instead of `ScryCard`.

### useScryIdentity

Combined identity data — ENS, Signet claims, PGP proofs, and EFP social graph.

```tsx
const identity = useScryIdentity('vitalik.eth')
// or
const identity = useScryIdentity('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
```

Returns: `ScryIdentity` with `address`, `ensName`, `ensAvatar`, `claims`, `totalClaims`, `activeClaims`, `currentFingerprint`, `pgpKeyInfo`, `proofs`, `efp`, `isLoading`, `error`.

### useSignetClaims

On-chain attestation data from the PGPRegistry contract.

```tsx
const { claims, totalClaims, activeClaims, currentFingerprint, isLoading } =
  useSignetClaims('0xd8dA...')
```

### useEFPGraph

EFP (Ethereum Follow Protocol) social graph data.

```tsx
const { efp, isLoading } = useEFPGraph('0xd8dA...')
// efp.followers, efp.following, efp.top8, efp.hasEfp
```

### usePGPProofs

PGP key info and verified social proofs from keyserver.

```tsx
const { keyInfo, proofs, isLoading } = usePGPProofs('03E53D807CE38C...')
// proofs[].provider, proofs[].status, proofs[].displayUrl
```

## Core utilities (no React)

The verification and data logic is exported as plain functions — no React, no provider. This is the layer the Scry explorer and the hooks both build on; use it directly when you need the validated data behind your own UI.

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
import { parsePgpKey, verifyAttestation, fetchKeyByFingerprint, fetchKeyByKeyId } from '@thurinlabs/identity-kit'

const keyInfo = await parsePgpKey(armoredKey)
// → { fingerprint, userIDs, algorithm, created, expires, notations, subkeys } | null

const verification = await verifyAttestation({ pgpPublicKey, pgpSignature, fingerprint, ethAddress })
// → { verified: boolean, reason?: string }

const armored = await fetchKeyByFingerprint(fingerprint) // from keys.openpgp.org
```

### EFP & claims

```ts
import { fetchEFPGraph } from '@thurinlabs/identity-kit'

const graph = await fetchEFPGraph(address)
// → { followers, following, top8: string[], hasEfp } | null
```

### Contract constants

```ts
import { REGISTRY_ADDRESS, REGISTRY_ABI, CONTRACT_DEPLOY_BLOCK } from '@thurinlabs/identity-kit'
```

Note `REGISTRY_ABI` here is read-only (events + `attestationCount` + `getAttestation`). Apps that write claims (the Signet flow) need their own ABI with the `attest`/`revoke` functions.

## Themes

Three built-in themes: `thurin`, `dark`, `light`. All styles are scoped under `[data-scry-theme]` with `scry-` prefixed class names to avoid conflicts with your app's styles.

Import styles when using `ScryCard`:

```tsx
import '@thurinlabs/identity-kit/styles'
```

Hooks-only consumers don't need to import styles.

## Embed (No React Required)

For static sites, Jekyll blogs, WordPress, or any HTML page — use the standalone embed script. Everything runs client-side; there's no Thurin backend in the path.

```html
<div
  data-scry-card="bendoubleu.eth"
  data-theme="thurin"
  data-rpc-url="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
></div>

<script src="https://cdn.jsdelivr.net/npm/@thurinlabs/identity-kit/dist/embed.global.js"></script>
```

| Attribute | Description |
|-----------|-------------|
| `data-scry-card` | ENS name or ETH address to look up (required) |
| `data-theme` | `thurin`, `dark`, or `light` (default: `thurin`) |
| `data-rpc-url` | An Ethereum RPC that supports `eth_getLogs` — required to verify on-chain claims. The card reads the chain directly, so use your own node or any provider. (Public fallback RPCs throttle `getLogs`.) |
| `data-neynar-key` | Optional. A Neynar API key, only to verify Farcaster proofs. Without it, Farcaster shows as unverified. |

The card talks directly to Ethereum, keys.openpgp.org, and each proof platform — no intermediary. Cards render automatically on page load and for dynamically added elements.

## Supported Proof Providers

| Provider | Proof Method |
|----------|-------------|
| GitHub | Public gist |
| DNS | TXT record |
| Farcaster | Public cast (requires Neynar API key) |
| Codeberg | Repository description |
| Mastodon | Profile metadata |

## Development

```bash
npm install
npm run build
npm test
```

## Links

- [Scry](https://thurin.id) — Identity explorer
- [Signet](https://thurin.id/signet) — Create identity claims
- [Documentation](https://docs.thurin.id)
- [GitHub](https://github.com/thurinlabs/identity-kit)
- [Codeberg](https://codeberg.org/thurinlabs/identity-kit)

## License

MIT
