# @thurinlabs/identity-kit

The library behind [Thurin.id](https://thurin.id), the Thurin CLI, and the share cards. It reads PGP claims from the PGPRegistry contract, checks them with openpgp.js, and checks the proofs on the key. One core, so "verified" means the same thing everywhere.

Full reference: [docs.thurin.id/#/sdk](https://docs.thurin.id/#/sdk).

```bash
npm install @thurinlabs/identity-kit
```

Runs in Node, workers, and browsers. The only peer dependency is `viem`. `@thurinlabs/identity-kit/core` is the same entry, for older imports.

## Read an address

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { readClaims, keyStanding, claimCheckText } from '@thurinlabs/identity-kit'

const client = createPublicClient({ chain: mainnet, transport: http('https://ethereum.publicnode.com'), batch: { multicall: true } })

const claims = await readClaims(client, '0x539C7e1E454296Dc150B95a0acCC05bCa3b33538')
const { kind, claim } = keyStanding(claims)
// kind: verified · not-counted (active claims, none verify) · inactive (only ended claims) · none
if (kind === 'verified') console.log(claim.fingerprint, claim.pgpPublicKey)
if (kind === 'not-counted' && claim.verification) console.log(claimCheckText(claim.verification).label)
```

`readClaims` returns every claim, oldest first, and reads and verifies the newest 50 (`{ limit }` changes that; older ones come back with `verification: null`). `keyStanding` picks the newest active claim that verifies. `findOwners(client, { fingerprint })` or `{ keyId }` goes the other way: every address that ever claimed a key. ENS is left to you: resolve the name with viem first. `batch: { multicall: true }` makes the reads one request.

In React, wrap it in whatever you use for data, for example:

```tsx
const { data: claims } = useQuery({ queryKey: ['claims', address], queryFn: () => readClaims(client, address) })
```

`verifyAttestation` checks that the key has the claimed fingerprint, that the signature is over exactly `I control the Ethereum address: <lowercase address>`, and that the key is valid today, as gpg judges it. When a claim doesn't count, `kind` says why (`expired`, `revoked`, `compromised`, `unsupported`, `bad-signature`, …) and `claimCheckText` turns it into words.

`REGISTRY_ADDRESS` is `0xFa6956c11163517249f8A67F5560a4406B519451`, the same on Ethereum mainnet and Sepolia; `getRegistry(network)` gives each network's chain id, explorer, and default RPC. `REGISTRY_ABI` is the whole contract, writes included.

**Is a key compromised?** Ask the contract: `keyStatus(owner, fingerprint)`. Don't read it off the newest claim, and never count "compromised" across owners: anyone can claim any fingerprint and mark it under their own address.

The rest, all covered in the [docs](https://docs.thurin.id/#/sdk):

- **Proofs:** `identifyProof`, `verifyProof` (GitHub, DNS, Farcaster, Codeberg, Mastodon; a GitHub or Codeberg proof must belong to the account in its URL).
- **Claim history:** `claimFates`, `claimFateText`, `expiresSoon`, `expiresSoonText`.
- **Records:** `kindName`, `checkKindName`, `checkRecordValue`, `fetchRecords`, `pickRecords`, `pageRecords`, `parseRecord`, and the `thurin.releases` helpers.
- **Permissions:** `attestTypedData`, `reattestTypedData`, `updateKeyTypedData`, `revokeTypedData`, `setRecordTypedData`, `markCompromisedTypedData`, for the registry's `…For` writes. To mark an already revoked claim compromised, sign `markCompromisedTypedData` alone.
- **Keys:** `parsePgpKey`, `leanKey`, `claimSignature`, `stripEmailUserIDs`, fingerprint and key-ID helpers.
- **ENS:** `fetchEnsHint`, `ensHintWrite` for the `id.thurin` record.
- **Avatars:** `avatarUrl`, `avatarFallbacks`, only from places that can't see the viewer: IPFS, Arweave, inline data, a content-addressed NFT, or `euc.li`.

## A card for your README

No library needed: thurin.id draws an image of any identity (name, key, and whether it's verified), `https://thurin.id/card/ens/<name>.png`. See [the docs](https://docs.thurin.id/#/sdk?id=readme-card).

## Key algorithms

Anything openpgp.js can verify: Ed25519, Cv25519, NIST P-256/384/521, brainpool, RSA, and secp256k1, which openpgp.js refuses by default and the kit allows. A secp256k1 PGP key is also an Ethereum key, so don't fund its address. In Node, secp256k1 needs `eckey-utils`, which the kit installs.

## Upgrading from 1.x

2.0.0 reads PGPRegistry v3. Claims store the key and signature as raw bytes.

| 1.x | 2.0.0 |
|---|---|
| `attestationsOf`, `getPayload` | `claimsOf`, `keyBytes`, `signatureBytes`; `readClaims` does it for you |
| `Attestation` | adds `state`, `replacedBy`, `revokeReason`; `messageVersion` 1 = detached, 0 = clearsigned |
| typed data `pgpSignature`, `pgpPublicKey` | `signature`, `key`; `Reattest` adds `keepRecords`, `Revoke` adds `reason`, `SetRecord` takes text; new `MarkCompromised` |
| `encodeRecord`, `decodeRecord`, `bytes32` kinds | text records listed by `recordsOf`; `checkKindName`, `checkRecordValue` |
| `RegistryDeployment.deployBlock` | removed |
| `IdentityKitProvider` and the hooks (`useThurinIdentity`, `useAttestations`, …) | removed; `readClaims`, `keyStanding`, `findOwners` in any framework |
| `ThurinCard`, the embed script, `/styles`, `Theme`, the `baseUrl` prop | removed; use the [card image](https://docs.thurin.id/#/sdk?id=readme-card) |
| a statement containing the address verified | the signed text must be exactly the statement |

## Development

```bash
npm install
npm run build
npm test
```

[GitHub](https://github.com/thurinlabs/identity-kit) · [Codeberg](https://codeberg.org/thurinlabs/identity-kit) · MIT
