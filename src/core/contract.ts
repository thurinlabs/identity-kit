import { mainnet, sepolia, foundry } from 'viem/chains'
export { REGISTRY_ABI } from './abi'

/**
 * PGPRegistry v2 is deployed with CREATE2, so it has the same address on every
 * network. (v1 lived at 0xf7a45BC662A78a6fb417ED5f52b3766cbf13EbBb on mainnet and
 * is no longer read by Thurin.)
 */
export const REGISTRY_ADDRESS = '0x9302E02e2869e129aC8516fE5eFFd51EA3082c09' as const

/** Networks the PGPRegistry is deployed on. `mainnet` is the default everywhere. */
export type NetworkName = 'mainnet' | 'sepolia' | 'local'

export interface RegistryDeployment {
  chainId: number
  address: `0x${string}`
  /** Block the registry was deployed in (informational; v2 needs no log scans). */
  deployBlock: bigint
  /** Block explorer base URL for address/tx links. Empty when there is none. */
  explorerUrl: string
  /** Keyless public RPC used when no rpcUrl is configured. */
  defaultRpcUrl: string
}

export const NETWORKS: Record<NetworkName, RegistryDeployment> = {
  mainnet: {
    chainId: 1,
    address: REGISTRY_ADDRESS,
    deployBlock: 25962908n, // 2026-09-12, tx 0xda4c3a19cae4e71ffb02559a048403f664d5a7967c19d42158c39600ec63bad8
    explorerUrl: 'https://etherscan.io',
    defaultRpcUrl: 'https://ethereum.publicnode.com',   // same service as ethereum-rpc.publicnode.com; this hostname resolves on more networks
  },
  sepolia: {
    chainId: 11155111,
    address: REGISTRY_ADDRESS,
    deployBlock: 11683667n, // 2026-09-11, tx 0x3e40e8f5b9fbf82a4b8943561bcc9b964b2987de10640ac8ff3a1b4ef0725322
    explorerUrl: 'https://sepolia.etherscan.io',
    defaultRpcUrl: 'https://ethereum-sepolia.publicnode.com',
  },
  /** A local anvil instance (`anvil`, chain id 31337). Deploy with pgp-registry's Deploy script. */
  local: {
    chainId: 31337,
    address: REGISTRY_ADDRESS,
    deployBlock: 0n,
    explorerUrl: '',
    defaultRpcUrl: 'http://127.0.0.1:8545',
  },
}

export function isNetworkName(value: unknown): value is NetworkName {
  return value === 'mainnet' || value === 'sepolia' || value === 'local'
}

/**
 * The registry deployment for a network. `addressOverride` swaps the contract
 * address (e.g. a local deploy that landed somewhere else).
 */
export function getRegistry(network: NetworkName = 'mainnet', addressOverride?: string): RegistryDeployment {
  const r = NETWORKS[network]
  if (!r) throw new Error(`Unknown network: ${network}`)
  if (addressOverride && /^0x[0-9a-fA-F]{40}$/.test(addressOverride)) {
    return { ...r, address: addressOverride as `0x${string}` }
  }
  return r
}

/** The viem chain object for a network name. */
export function chainFor(network: NetworkName = 'mainnet') {
  if (network === 'sepolia') return sepolia
  if (network === 'local') return foundry
  return mainnet
}
