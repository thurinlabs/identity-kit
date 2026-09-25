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
// Zero config — public RPC and a public Farcaster node, no keys
<IdentityKitProvider>
  <ThurinCard ens="vitalik.eth" />
</IdentityKitProvider>

// With options
<IdentityKitProvider
  rpcUrl="https://your-node.example"
  farcasterHub="https://your-farcaster-node.example"
  baseUrl="https://thurin.id"
>
  <ThurinCard ens="vitalik.eth" />
</IdentityKitProvider>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rpcUrl` | `string` | publicnode | Ethereum RPC endpoint. Any RPC works: reads are plain `eth_call` |
| `farcasterHub` | `string` | Hypersnap public node | A Farcaster node's HTTP API for Farcaster proofs. The default, Quilibrium's `haatz.quilibrium.com`, needs no key; it sees the visitor's IP and which account was checked (1.3.7) |
| `neynarApiKey` | `string` | — | Optional: read Farcaster through Neynar's hub instead. Not needed since 1.3.7 |
| `baseUrl` | `string` | `https://thurin.id` | Base URL for "View on Thurin" links |
| `network` | `'mainnet' \| 'sepolia' \| 'local'` | `'mainnet'` | Which chain to read the PGPRegistry on (`local` = a running anvil) |
| `registryAddress` | `string` | registry address | Override the registry contract address |

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

When the identity can't be shown, `error` is a plain `Error` safe to display and `errorKind` says why: `'rpc'` (the RPC didn't answer, so nothing is known), `'not-found'` (the ENS name has no address), or `'read'` (the RPC answers but a registry read failed); `retry()` re-runs the lookups. `ThurinCard` shows these instead of zeros, and a follower count EFP didn't answer for shows `–` (1.3.4).

`ensAvatar` is set only when loading it can't reveal the viewer to the name's owner: IPFS, Arweave, inline data, a content-addressed NFT, or `euc.li` (the ENS app's upload host). IPFS images load through `ipfs.filebase.io`, falling back to Pinata's public gateway if that fails (`IPFS_GATEWAYS`, `avatarFallbacks()`; 1.3.6). A plain `https://` avatar on the owner's own server is left out, since loading it would hand that server every viewer's IP (1.3.3; earlier versions loaded any avatar). The rule is `avatarUrl()` in the core; `useSafeAvatar(name, chainId)` is the hook.

### useAttestations

An address's claims from the PGPRegistry: the history (`claimsOf`) plus each claim's stored key and signature, read with plain contract calls (no event logs), each verified here.

```tsx
const { claims, totalClaims, activeClaims, currentFingerprint, isLoading } =
  useAttestations('0xd8dA...')
// claims[].{ index, fingerprint, createdAt, revoked, revokedAt, state, replacedBy, revokeReason,
//            messageVersion, pgpSignature, pgpPublicKey, verification }
```

`keyStatus(owner, fingerprint)` on the contract says whether an address can claim a key: `'none'`, `'active'`, `'revoked'`, or `'compromised'` (revoked as compromised: that address can never claim it again). An owner can mark a claim they already revoked or replaced as compromised later, once; "superseded" is set only by reattest (`OWNER_REVOKE_REASONS` lists what `revoke` takes).

`state` is `'active'`, `'revoked'`, or `'replaced'` (revoked by a reattest; `replacedBy` is the new claim's index). `pgpPublicKey` and `pgpSignature` come back as armored text, ready for display or `gpg --import`.

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

### useEnsHint

```tsx
const { state, record, reason, isLoading } = useEnsHint('ben.thurinlabs.eth', identity.currentFingerprint)
```

The name's `id.thurin` text record against the key the registry verifies for its address. `state` is `match`, `unset`, or `mismatch` (with a `reason`). The record is a discovery hint an ENS profile can show; the trust is in the claim. See [Point your ENS name at your claim](https://docs.thurin.id/#/guides/ens-record).

### useRecords

```tsx
const { records, isLoading } = useRecords(identity.address, claimIndex)
// records: [{ kind: 'thurin.railgun', text, valid, data: { type: 'railgun', address } }, ...]
```

The records on one claim for the kinds an identity page shows (`IDENTITY_KINDS`), read in one multicall and parsed. Kinds with no record are left out. See the [records reference](https://docs.thurin.id/#/records).

## `@thurinlabs/identity-kit/core` — no React

Everything under "Core utilities" below is also published as its own entry point with no React, wagmi, or DOM dependency, for Node and worker consumers (the Thurin CLI and the share-card service use it):

```ts
import { verifyAttestation, parsePgpKey, getRegistry, chainFor } from '@thurinlabs/identity-kit/core'
```

Runtime dependencies of this entry: `openpgp` (bundled dependency), `viem` (peer), and in Node `eckey-utils` (dependency) for secp256k1 keys.

## Core utilities (no React)

The verification and data logic is exported as plain functions — no React, no provider. This is the layer the thurin.id explorer and the hooks both build on; use it directly when you need the validated data behind your own UI.

### Proofs

```ts
import { identifyProof, verifyProof, displayUrl, proofHref, proofSecondaryHref } from '@thurinlabs/identity-kit'

const proof = identifyProof({ name: 'proof@thurin.id', value: 'https://gist.github.com/alice/abc123' })
// → { provider: 'github', label: 'GitHub', user: 'alice', gistId: 'abc123', url }

const result = await verifyProof(proof, fingerprint)   // options: { farcasterHub?, neynarApiKey? }
// → { verified: boolean, reason?: string }
```

`verifyProof` performs the real check per provider — including confirming the GitHub gist is **owned** by the claimed user, so a proof can't be forged by pointing at someone else's gist ID. `displayUrl` / `proofHref` / `proofSecondaryHref` build the display string and links.

### PGP

```ts
import { parsePgpKey, verifyAttestation, stripEmailUserIDs, hasEmailUserID } from '@thurinlabs/identity-kit'

const keyInfo = await parsePgpKey(armoredKey)
// → { fingerprint, userIDs, algorithm, created, expires, notations, subkeys } | null

const verification = await verifyAttestation({ pgpPublicKey, pgpSignature, fingerprint, ethAddress })
// → { verified, kind, at?, revocationReason?, signingKey?, expiresAt?, algorithm?, reason? }
//   kind: 'verified' | 'expired' | 'signing-key-expired' | 'revoked' | 'compromised'
//       | 'signing-key-revoked' | 'unsupported' | 'bad-signature'   (1.4.0)

// Prepare a key for publishing: drop every user ID that contains an email address.
const stripped = await stripEmailUserIDs(armoredKey)
// → { armored, kept: ['thurin'], removed: ['Alice <alice@example.com>'] } | null (null = nothing would remain)

await hasEmailUserID(armoredKey) // → true if any user ID contains an @
```

**Published identity.** An attestation stores the armored key on-chain, permanently and publicly. Since 0.9.0 the intended shape is a key whose only user ID is a non-email one (usually the name already on the key, without the email), carrying the `proof@thurin.id` notations. `stripEmailUserIDs` produces that from a normal export; the stripped key still verifies (`verifyAttestation` needs at least one self-certified user ID, so a key with none is rejected) and keeps the notations on the user ID it retains. Proofs are then read from the on-chain key, never from a keyserver.

### Why a claim does or doesn't count (1.4.0)

`verifyAttestation` returns a `kind` along with `verified`, so a page can say why in plain words instead of showing a library error. Checked in this order: the key revoked (`compromised` when the owner's reason was compromise), the key expired, the signing subkey revoked, the signing subkey expired; then an algorithm openpgp.js refuses (`unsupported`, e.g. DSA); anything else is `bad-signature`. `at` is the date that goes with it. A verified result carries `expiresAt`: the earlier of the key's and the signing subkey's expiry.

```ts
import { claimCheckText, expiresSoon, expiresSoonText, claimFates, claimFateText, CLAIM_CHECK_LABEL } from '@thurinlabs/identity-kit'

claimCheckText(verification)
// → { kind: 'expired', label: 'key expired',
//     sentence: 'The key on this claim expired on Mar 5, 2029, so the claim no longer counts.',
//     fix: 'Extend the key, then Update key. No new signature needed.' }   // `fix` is for the owner

const soon = expiresSoon(verification)           // within 30 days → { days, at } | null
if (soon) expiresSoonText(soon)                  // 'Key expires in 12 days (Mar 6, 2027).'

// Revoked or replaced: reattest revokes and attests in one transaction, so a claim revoked the
// same second a newer one was created was replaced by it.
const fates = claimFates(attestations)           // Map<index, { state: 'active' | 'revoked' | 'replaced', at?, by? }>
claimFateText(fates.get(1)!)                     // 'Replaced by claim #2 on Oct 3, 2026.'
```

Dates are formatted in UTC ("Mar 5, 2029") so every viewer sees the same day; pass your own formatter as the second argument.

Nothing in the kit talks to a keyserver: keys come from the registry, and `thurin keyserver` / keys.thurin.id serve them over HKP for gpg.

### EFP & claims

```ts
import { fetchEFPGraph } from '@thurinlabs/identity-kit'

const graph = await fetchEFPGraph(address)
// → { followers, following, top8: string[], hasEfp } | null
```

### Contract

```ts
import { REGISTRY_ADDRESS, REGISTRY_ABI, NETWORKS, getRegistry } from '@thurinlabs/identity-kit'

getRegistry('sepolia') // → { chainId: 11155111, address, explorerUrl, defaultRpcUrl }
```

`REGISTRY_ABI` is the complete ABI (reads and writes), so apps that publish claims use the same one. The registry is deployed with CREATE2, so it has the same address on Ethereum mainnet and Sepolia.

### Records

```ts
import { fetchRecords, parseRecord, checkKindName, checkRecordValue, IDENTITY_KINDS, KNOWN_KINDS } from '@thurinlabs/identity-kit/core'

const records = await fetchRecords(publicClient, REGISTRY_ADDRESS, REGISTRY_ABI, owner, claimIndex)         // IDENTITY_KINDS, in display order
const every = await fetchRecords(publicClient, REGISTRY_ADDRESS, REGISTRY_ABI, owner, claimIndex, null)     // every record on the claim
// pageRecords(names, values): what an identity page shows, Thurin's kinds first, then others in first-set order
const one = await parseRecord('thurin.canary', text)   // { valid, reason?, data: { type: 'canary', date, statement, clearsigned } }
// write: setRecord(index, checkKindName('canary'), checkRecordValue(text)); an empty value clears it
```

A record is a named text value on a claim, up to 1 KB, set only by the owner; `recordsOf(owner, index)` lists them. Names are `a-z 0-9 - .`, up to 31 bytes; a name without a dot gets `thurin.` in front. `parseRecord` never throws: a value that does not fit its kind comes back with `valid: false` and a reason. Kinds Thurin defines: `thurin.railgun`, `thurin.security`, `thurin.successor`, `thurin.affiliation`, `thurin.canary`, `thurin.private`, `thurin.disclosure` (shown on identity pages) and `thurin.pointer` (the Thurin Labs release list). Anyone can use reverse-dot names of their own.

### ENS record (`id.thurin`)

```ts
import { ensHintFor, ensHintValue, ensHintWrite, fetchEnsHint, ENS_HINT_KEY } from '@thurinlabs/identity-kit/core'

const hint = await fetchEnsHint(publicClient, 'ben.thurinlabs.eth', verifiedFingerprint)   // { state: 'match' | 'unset' | 'mismatch', record, fingerprint, expected, reason? }
const call = ensHintWrite('ben.thurinlabs.eth', verifiedFingerprint)                        // { abi, functionName: 'setText', args: [namehash, 'id.thurin', 'FPR…'] }
const resolver = await publicClient.getEnsResolver({ name: call.name })                     // look it up at write time; ENSv2 resolvers are per account
```

`ensHintFor(record, fingerprint)` is the pure comparison; `ensHintValue` is the bare uppercase form Thurin writes.

### Avatars

```ts
import { avatarUrl, parseNftAvatar, nftAvatarImage } from '@thurinlabs/identity-kit/core'

avatarUrl('ipfs://Qm…')                     // 'https://ipfs.filebase.io/ipfs/Qm…' (avatarFallbacks() → Pinata)
avatarUrl('https://euc.li/vitalik.eth')     // allowed: ENS Labs' host, not the owner's
avatarUrl('https://example.com/me.png')     // null: the owner's server would see every viewer
```

### Fingerprints and key IDs

The registry takes raw fingerprint bytes and indexes them by long key ID:

```ts
import { fingerprintToBytes, bytesToFingerprint, fingerprintHash, keyIdOf, keyIdToBytes } from '@thurinlabs/identity-kit'

fingerprintToBytes('6E00 5391 … 7FE7')  // → '0x6e0053911942a889426c1866e34d9266098f7fe7' (attest / reattest arg)
bytesToFingerprint('0x6e00…7fe7')       // → '6e0053911942a889426c1866e34d9266098f7fe7'
fingerprintHash(fp)                      // → keccak256 of the raw bytes (the indexed fingerprintHash in events)
keyIdOf(fp)                              // → '0xe34d9266098f7fe7' (fingerprintsForKeyId arg; v4 = last 8 bytes, v6 = first 8, per RFC 9580)
```

### Authorized writes (EIP-712)

Every write has a `…For` twin that anyone can submit with the owner's signature — for cold wallets, a CLI, or a sponsor. The helpers build exactly the typed data the contract verifies:

```ts
import { attestTypedData, authorizationDigest } from '@thurinlabs/identity-kit'
import { signTypedData } from '@wagmi/core'

const nonce = await readContract({ ..., functionName: 'nonces', args: [owner] })
const typedData = attestTypedData(chainId, registryAddress, {
  owner, fingerprint, signature, key, nonce, deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),   // signature, key: 0x… raw bytes
})
const signature = await signTypedData(config, typedData)
// anyone: attestFor(owner, fingerprintBytes, sigBytes, keyBytes, deadline, signature)
```

Also `reattestTypedData` (with `keepRecords`), `updateKeyTypedData`, `revokeTypedData` (with a `reason` from `REVOKE_REASONS`), and `setRecordTypedData` (`kind` and `value` as text, exactly as submitted). The contract accepts a plain signature from the owner's key (EIP-7702 accounts included) or, for a contract wallet, EIP-1271.

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
  data-rpc-url="https://your-node.example"
></div>

<script src="https://cdn.jsdelivr.net/npm/@thurinlabs/identity-kit@0/dist/embed.global.js"></script>
```

| Attribute | Description |
|-----------|-------------|
| `data-thurin-card` | ENS name or ETH address to look up (required) |
| `data-theme` | `thurin`, `dark`, or `light` (default: `thurin`). Change it after render and the card follows, so a page with a theme switch can keep the card in step. |
| `data-rpc-url` | Optional. Any Ethereum RPC; the card reads the registry with plain calls, so the keyless public default works. |
| `data-farcaster-hub` | Optional. A Farcaster node for Farcaster proofs; the default is a public node that needs no key. |
| `data-neynar-key` | Optional. Read Farcaster through Neynar with your key instead (not needed since 1.3.7). |
| `data-base-url` | Optional. Where the card's "View on Thurin" link points (default `https://thurin.id`). A page served from ENS can pass its own name so the link stays on ENS. |
| `data-network` | Optional. `sepolia` or `local` instead of mainnet. |
| `data-registry-address` | Optional. Override the registry contract address. |

The card talks directly to Ethereum and each proof platform — no intermediary, no keyserver. Cards render automatically on page load and for dynamically added elements.

## Supported Proof Providers

| Provider | Proof Method |
|----------|-------------|
| GitHub | Public gist, or a repository description (the form an organisation can use) |
| DNS | TXT record |
| Farcaster | Public cast (read from a public Farcaster node; no key) |
| Codeberg | Repository description |
| Mastodon | Profile metadata |

## How a claim is verified

`verifyAttestation` checks three things: the stored key's fingerprint is the one on the claim; the stored signature was made by that key (or one of its bound signing subkeys); and what it signs is exactly the statement for the claim's address, `I control the Ethereum address: <lowercase address>` (a detached signature must cover it with no trailing line break, as `printf '%s'` gives it; a stored clearsigned message may end in one). `claimSignature()` picks what to store from what someone pasted: the bare signature when that verifies, otherwise the whole clearsigned message. Key validity is judged **now**, the way gpg does it: the key must currently be bound, unrevoked, and unexpired. It is deliberately not judged at the instant the signature was made, which is openpgp.js's default. That default rejects a perfectly good claim whenever the key's newest self-certification postdates the attest signature, which is exactly what happens when you add a proof after attesting and export with `export-minimal` (1.0.3).

## Key algorithms

Any curve openpgp.js can compute is accepted: Ed25519, Cv25519, NIST P-256/384/521, brainpool, RSA (2048 bits and up), and **secp256k1**. DSA and short RSA keys are refused by openpgp.js as too weak; since 1.4.0 such a claim reports `kind: 'unsupported'`. openpgp.js rejects secp256k1 by default because RFC 9580 does not list it; identity-kit removes secp256k1 from `rejectCurves` and leaves the rest of the list alone, since that one entry is a compatibility rule, not a security one (1.3.2; earlier versions cleared the whole set). A secp256k1 PGP key doubles as an Ethereum key (the address is derived from the same public point), so anything that can sign with the PGP key can sign Ethereum transactions: hold such a key if you like, but do not fund its derived address. In Node, openpgp.js needs the `eckey-utils` package for this curve; identity-kit depends on it, so `npm install` brings it in. The browser build needs nothing extra.

## Migrating from 1.x

2.0.0 reads **PGPRegistry v3** (`0xFa6956c11163517249f8A67F5560a4406B519451` on Ethereum mainnet and Sepolia). Claims store the key and signature as raw bytes.

| 1.x | 2.0.0 |
|-----|-------|
| `attestationsOf` / `getPayload` | `claimsOf`, `keyBytes`, `signatureBytes` (the hooks do this for you) |
| `Attestation` | adds `state`, `replacedBy`, `revokeReason`; `messageVersion` 1 = detached, 0 = clearsigned |
| typed data `pgpSignature`, `pgpPublicKey` | `signature`, `key`; `Reattest` adds `keepRecords`, `Revoke` adds `reason`, `SetRecord` takes text `kind` and `value` |
| `encodeRecord` / `decodeRecord`, `bytes32` kinds | `checkRecordValue`, `checkKindName`; records are text, listed by `recordsOf` |
| `fetchRecords(…, kinds)` read one kind at a time | one `recordsOf` read; `kinds: null` returns every record |
| `RegistryDeployment.deployBlock` | removed |
| a statement containing the address verified | the signed text must be exactly the statement |
| — | `claimSignature`, `REVOKE_REASONS`, `pickRecords`, `pageRecords`, `MAX_KIND_BYTES` |

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
