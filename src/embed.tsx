import { createRoot } from 'react-dom/client'
import { isNetworkName } from './core/contract'
import { IdentityKitProvider } from './provider'
import { ThurinCard } from './components/ThurinCard/ThurinCard'
import type { Theme } from './core/types'

// Inline CSS for Shadow DOM isolation
import themeCss from './themes/index.css?raw'
import cardCss from './components/ThurinCard/ThurinCard.css?raw'

const EMBED_CSS = themeCss + '\n' + cardCss

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

function renderCards() {
  const elements = document.querySelectorAll<HTMLElement>('[data-thurin-card]')
  if (elements.length === 0) return

  elements.forEach((el) => {
    // Skip if already rendered
    if (el.dataset.thurinRendered) return
    el.dataset.thurinRendered = 'true'

    const value = el.dataset.thurinCard!
    const theme = (el.dataset.theme as Theme) || 'thurin'
    // Optional config via data attributes — everything stays client-side.
    // data-rpc-url: any getLogs-capable Ethereum RPC (needed to verify on-chain
    //   claims; the public fallback throttles eth_getLogs).
    // data-neynar-key: optional, only to verify Farcaster proofs.
    const rpcUrl = el.dataset.rpcUrl
    const neynarApiKey = el.dataset.neynarKey
    // data-network: 'mainnet' (default), 'sepolia', or 'local' (anvil).
    // data-registry-address: optional override of the registry contract address.
    const network = isNetworkName(el.dataset.network) ? el.dataset.network : 'mainnet'
    const registryAddress = el.dataset.registryAddress
    const props = isAddress(value) ? { address: value } : { ens: value }

    // Create Shadow DOM for style isolation
    const shadow = el.attachShadow({ mode: 'open' })

    // Inject styles into shadow
    const style = document.createElement('style')
    style.textContent = EMBED_CSS
    shadow.appendChild(style)

    // Create render target inside shadow
    const container = document.createElement('div')
    shadow.appendChild(container)

    const root = createRoot(container)
    root.render(
      <IdentityKitProvider rpcUrl={rpcUrl} neynarApiKey={neynarApiKey} network={network} registryAddress={registryAddress}>
        <ThurinCard {...props} theme={theme} />
      </IdentityKitProvider>,
    )
  })
}

// Render on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderCards)
} else {
  renderCards()
}

// Watch for dynamically added elements
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        if (node.dataset.thurinCard || node.querySelector('[data-thurin-card]')) {
          renderCards()
          return
        }
      }
    }
  }
})

observer.observe(document.body, { childList: true, subtree: true })
