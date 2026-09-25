# @thurinlabs/identity-kit

The library behind [Thurin.id](https://thurin.id), the Thurin CLI, and the share cards. It reads PGP claims from the PGPRegistry contract, checks them with openpgp.js, and checks the proofs on the key. One core, so "verified" means the same thing everywhere.

Full reference: [docs.thurin.id/#/sdk](https://docs.thurin.id/#/sdk).

```bash
npm install @thurinlabs/identity-kit
```

Two entry points:

- `@thurinlabs/identity-kit`: React hooks and their provider, plus everything in core. Peer dependencies: `react`, `react-dom`, `wagmi`, `viem`, `@tanstack/react-query`.
- `@thurinlabs/identity-kit/core`: plain functions, no React or DOM. For Node, workers, and your own UI. Needs only `viem` as a peer.

## React

```tsx
import { IdentityKitProvider, useThurinIdentity } from '@thurinlabs/identity-kit'

<IdentityKitProvider>
  <YourApp />
</IdentityKitProvider>
```

`IdentityKitProvider` works with no props: it reads through a keyless public node. If your app already has a `WagmiProvider`, it uses that.

| Prop | Default | |
|---|---|---|
| `rpcUrl` | `https://ethereum.publicnode.com` | any Ethereum RPC; reads are plain `eth_call` |
| `network` | `mainnet` | `mainnet`, `sepolia`, or `local` (anvil) |
| `registryAddress` | `REGISTRY_ADDRESS` | override the registry address |
| `farcasterHub` | Quilibrium's keyless node | Farcaster node for Farcaster proofs |
| `neynarApiKey` | none | read Farcaster through Neynar instead |

## Hooks

```tsx
const id = useThurinIdentity('thurinlabs.eth')   // or an address
// id.address, ensName, ensAvatar, claims, totalClaims, activeClaims,
// currentFingerprint, pgpKeyInfo, proofs, isLoading, error, errorKind, retry()
```

`currentFingerprint` is the newest active claim whose signature verifies. Nothing from an unverified claim is shown.

Also `useAttestations(address)`, `usePGPProofs(fingerprint, armoredKey)`, `useRecords(address, index)`, `useEnsHint(name, fingerprint)`, and `useSafeAvatar(name, chainId)`. Avatars only load from places that can't see the viewer: IPFS, Arweave, inline data, a content-addressed NFT, or `euc.li`.

## Core

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { REGISTRY_ADDRESS, REGISTRY_ABI, bytesToFingerprint, verifyAttestation, claimCheckText } from '@thurinlabs/identity-kit/core'

const client = createPublicClient({ chain: mainnet, transport: http('https://ethereum.publicnode.com') })
const owner = '0xYourAddress' as `0x${string}`

const claims = await client.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'claimsOf', args: [owner] })
for (const c of claims) {
  const key = await client.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'keyBytes', args: [owner, c.index] })
  const sig = await client.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: 'signatureBytes', args: [owner, c.index] })
  const v = await verifyAttestation({ pgpPublicKey: key, pgpSignature: sig, fingerprint: bytesToFingerprint(c.fingerprint), ethAddress: owner })
  console.log(c.index, c.state, c.revokeReason, v.verified ? 'verified' : claimCheckText(v).label)
}
```

`verifyAttestation` checks that the key has the claimed fingerprint, that the signature is over exactly `I control the Ethereum address: <lowercase address>`, and that the key is valid today, as gpg judges it. When a claim doesn't count, `kind` says why (`expired`, `revoked`, `compromised`, `unsupported`, `bad-signature`, …) and `claimCheckText` turns it into words.

`REGISTRY_ADDRESS` is `0xFa6956c11163517249f8A67F5560a4406B519451`, the same on Ethereum mainnet and Sepolia; `getRegistry(network)` gives each network's chain id, explorer, and default RPC. `REGISTRY_ABI` is the whole contract, writes included.

**Is a key compromised?** Ask the contract: `keyStatus(owner, fingerprint)`. Don't read it off the newest claim, and never count "compromised" across owners: anyone can claim any fingerprint and mark it under their own address.

The rest of core, all covered in the [docs](https://docs.thurin.id/#/sdk):

- **Proofs:** `identifyProof`, `verifyProof` (GitHub, DNS, Farcaster, Codeberg, Mastodon; a GitHub or Codeberg proof must belong to the account in its URL).
- **Claim history:** `claimFates`, `claimFateText`, `expiresSoon`, `expiresSoonText`.
- **Records:** `kindName`, `checkKindName`, `checkRecordValue`, `fetchRecords`, `pickRecords`, `pageRecords`, `parseRecord`, and the `thurin.releases` helpers.
- **Permissions:** `attestTypedData`, `reattestTypedData`, `updateKeyTypedData`, `revokeTypedData`, `setRecordTypedData`, `markCompromisedTypedData`, for the registry's `…For` writes. To mark an already revoked claim compromised, sign `markCompromisedTypedData` alone.
- **Keys:** `parsePgpKey`, `leanKey`, `claimSignature`, `stripEmailUserIDs`, fingerprint and key-ID helpers.
- **ENS:** `fetchEnsHint`, `ensHintWrite` for the `id.thurin` record.

## A card for your README

No library needed: thurin.id draws an image of any identity (name, key, and whether it's verified), `https://thurin.id/card/ens/<name>.png`. See [the docs](https://docs.thurin.id/#/sdk?id=readme-card).

## Key algorithms

Anything openpgp.js can verify: Ed25519, Cv25519, NIST P-256/384/521, brainpool, RSA, and secp256k1, which openpgp.js refuses by default and the kit allows. A secp256k1 PGP key is also an Ethereum key, so don't fund its address. In Node, secp256k1 needs `eckey-utils`, which the kit installs.

## Upgrading from 1.x

2.0.0 reads PGPRegistry v3. Claims store the key and signature as raw bytes.

| 1.x | 2.0.0 |
|---|---|
| `attestationsOf`, `getPayload` | `claimsOf`, `keyBytes`, `signatureBytes` (the hooks do this for you) |
| `Attestation` | adds `state`, `replacedBy`, `revokeReason`; `messageVersion` 1 = detached, 0 = clearsigned |
| typed data `pgpSignature`, `pgpPublicKey` | `signature`, `key`; `Reattest` adds `keepRecords`, `Revoke` adds `reason`, `SetRecord` takes text; new `MarkCompromised` |
| `encodeRecord`, `decodeRecord`, `bytes32` kinds | text records listed by `recordsOf`; `checkKindName`, `checkRecordValue` |
| `RegistryDeployment.deployBlock` | removed |
| `ThurinCard`, the embed script, `/styles`, `Theme`, the `baseUrl` prop | removed; use the [card image](https://docs.thurin.id/#/sdk?id=readme-card) |
| a statement containing the address verified | the signed text must be exactly the statement |

## Development

```bash
npm install
npm run build
npm test
```

[GitHub](https://github.com/thurinlabs/identity-kit) · [Codeberg](https://codeberg.org/thurinlabs/identity-kit) · MIT
