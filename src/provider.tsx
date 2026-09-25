import { type ReactNode, useMemo } from 'react'
import { WagmiProvider, createConfig, http, useConfig } from 'wagmi'
import { mainnet, sepolia, foundry } from 'wagmi/chains'
import { getRegistry } from './core/contract'
import type { NetworkName } from './core/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IdentityKitContext } from './context'
import type { IdentityKitConfig } from './core/types'

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})


function createDefaultWagmiConfig(rpcUrl: string | undefined, network: NetworkName) {
  const url = rpcUrl || getRegistry(network).defaultRpcUrl
  // Spelled out per network: wagmi types `transports` by the exact chain ids.
  if (network === 'sepolia') return createConfig({ chains: [sepolia], transports: { [sepolia.id]: http(url) } })
  if (network === 'local') return createConfig({ chains: [foundry], transports: { [foundry.id]: http(url) } })
  return createConfig({ chains: [mainnet], transports: { [mainnet.id]: http(url) } })
}

function WagmiDetector({ children, rpcUrl, network }: { children: ReactNode; rpcUrl?: string; network: NetworkName }) {
  // Try to use existing wagmi config
  let hasWagmi = false
  try {
    useConfig()
    hasWagmi = true
  } catch {
    // No WagmiProvider above us
  }

  const wagmiConfig = useMemo(() => createDefaultWagmiConfig(rpcUrl, network), [rpcUrl, network])

  if (hasWagmi) {
    return <>{children}</>
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={defaultQueryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export interface IdentityKitProviderProps extends IdentityKitConfig {
  children: ReactNode
}

export function IdentityKitProvider({
  children,
  rpcUrl,
  neynarApiKey,
  farcasterHub,
  network = 'mainnet',
  registryAddress,
}: IdentityKitProviderProps) {
  const config = useMemo(
    () => ({ rpcUrl, neynarApiKey, farcasterHub, network, registryAddress }),
    [rpcUrl, neynarApiKey, farcasterHub, network, registryAddress],
  )

  return (
    <IdentityKitContext.Provider value={config}>
      <WagmiDetector rpcUrl={rpcUrl} network={network}>
        {children}
      </WagmiDetector>
    </IdentityKitContext.Provider>
  )
}
