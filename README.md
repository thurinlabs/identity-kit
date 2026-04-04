# @thurinlabs/identity-kit

React SDK for embedding Thurin identity data. Drop-in components and hooks for displaying on-chain identity claims, PGP verification, social proofs, and EFP social graph data.

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

**Displays:** ENS avatar, name, address, Signet seal count, verified proof count, EFP follower count, proof provider badges, and a link to the full [Scry](https://scry.thurin.id) profile.

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
  scryBaseUrl="https://scry.thurin.id"
>
  <ScryCard ens="vitalik.eth" />
</IdentityKitProvider>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rpcUrl` | `string` | publicnode | Ethereum RPC endpoint |
| `neynarApiKey` | `string` | — | Neynar API key for Farcaster proof verification |
| `scryBaseUrl` | `string` | `https://scry.thurin.id` | Base URL for "View on Scry" links |

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

## Themes

Three built-in themes: `thurin`, `dark`, `light`. All styles are scoped under `[data-scry-theme]` with `scry-` prefixed class names to avoid conflicts with your app's styles.

Import styles when using `ScryCard`:

```tsx
import '@thurinlabs/identity-kit/styles'
```

Hooks-only consumers don't need to import styles.

## Embed (No React Required)

For static sites, Jekyll blogs, WordPress, or any HTML page — use the standalone embed script. No React, no bundler, no config.

```html
<div data-scry-card="bendoubleu.eth" data-theme="thurin"></div>
<div data-scry-card="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" data-theme="dark"></div>

<script src="https://cdn.jsdelivr.net/npm/@thurinlabs/identity-kit/dist/embed.global.js"></script>
```

| Attribute | Description |
|-----------|-------------|
| `data-scry-card` | ENS name or ETH address to look up (required) |
| `data-theme` | `thurin`, `dark`, or `light` (default: `thurin`) |

The script bundles everything (React, wagmi, viem) internally. Cards render automatically on page load and for dynamically added elements.

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

- [Scry](https://scry.thurin.id) — Identity explorer
- [Signet](https://signet.thurin.id) — Create identity claims
- [Documentation](https://docs.thurin.id)
- [Codeberg](https://codeberg.org/thurinlabs/identity-kit)

## License

MIT
