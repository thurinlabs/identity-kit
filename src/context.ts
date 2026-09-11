import { createContext, useContext } from 'react'
import type { IdentityKitConfig } from './core/types'

const defaultConfig: IdentityKitConfig = {
  baseUrl: 'https://thurin.id',
  network: 'mainnet',
}

export const IdentityKitContext = createContext<IdentityKitConfig>(defaultConfig)

export function useIdentityKitConfig(): IdentityKitConfig {
  return useContext(IdentityKitContext)
}
