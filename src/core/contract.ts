import { mainnet, sepolia, foundry } from 'viem/chains'
export { REGISTRY_ABI } from './abi'

/** PGPRegistry v3. Deployed with CREATE2, so the address is the same on mainnet, Sepolia, and a local anvil. */
export const REGISTRY_ADDRESS = '0xFa6956c11163517249f8A67F5560a4406B519451' as const

/** Networks the PGPRegistry is deployed on. `mainnet` is the default everywhere. */
export type NetworkName = 'mainnet' | 'sepolia' | 'local'

export interface RegistryDeployment {
  chainId: number
  address: `0x${string}`
  /** Block explorer base URL for address/tx links. Empty when there is none. */
  explorerUrl: string
  /** Keyless public RPC used when no rpcUrl is configured. */
  defaultRpcUrl: string
}

export const NETWORKS: Record<NetworkName, RegistryDeployment> = {
  mainnet: {
    chainId: 1,
    address: REGISTRY_ADDRESS,
    explorerUrl: 'https://etherscan.io',
    defaultRpcUrl: 'https://ethereum.publicnode.com',   // resolves on more networks than ethereum-rpc.publicnode.com
  },
  sepolia: {
    chainId: 11155111,
    address: REGISTRY_ADDRESS,
    explorerUrl: 'https://sepolia.etherscan.io',
    defaultRpcUrl: 'https://ethereum-sepolia.publicnode.com',
  },
  /** A local anvil instance (`anvil`, chain id 31337). Deploy with pgp-registry's Deploy script. */
  local: {
    chainId: 31337,
    address: REGISTRY_ADDRESS,
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
