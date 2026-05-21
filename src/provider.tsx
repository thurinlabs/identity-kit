import { type ReactNode, useMemo } from 'react'
import { WagmiProvider, createConfig, http, useConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
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

function createDefaultWagmiConfig(rpcUrl?: string) {
  return createConfig({
    chains: [mainnet],
    transports: {
      [mainnet.id]: http(rpcUrl || 'https://ethereum-rpc.publicnode.com'),
    },
  })
}

function WagmiDetector({ children, rpcUrl }: { children: ReactNode; rpcUrl?: string }) {
  // Try to use existing wagmi config
  let hasWagmi = false
  try {
    useConfig()
    hasWagmi = true
  } catch {
    // No WagmiProvider above us
  }

  const wagmiConfig = useMemo(() => createDefaultWagmiConfig(rpcUrl), [rpcUrl])

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
  scryBaseUrl = 'https://thurin.id',
}: IdentityKitProviderProps) {
  const config = useMemo(
    () => ({ rpcUrl, neynarApiKey, scryBaseUrl }),
    [rpcUrl, neynarApiKey, scryBaseUrl],
  )

  return (
    <IdentityKitContext.Provider value={config}>
      <WagmiDetector rpcUrl={rpcUrl}>
        {children}
      </WagmiDetector>
    </IdentityKitContext.Provider>
  )
}
