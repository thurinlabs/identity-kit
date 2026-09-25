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
    // data-rpc-url: any Ethereum RPC (reads are plain eth_call; the keyless public default works).
    // data-farcaster-hub: optional Farcaster node for Farcaster proofs (default: a public keyless node).
    // data-neynar-key: optional, read Farcaster through Neynar instead (not needed since 1.3.7).
    // data-base-url: where "View on Thurin" points (default https://thurin.id);
    //   a page served from ENS sets its own name here so the link stays on ENS.
    const rpcUrl = el.dataset.rpcUrl
    const neynarApiKey = el.dataset.neynarKey
    const farcasterHub = el.dataset.farcasterHub
    const baseUrl = el.dataset.baseUrl
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
    const render = (t: Theme) =>
      root.render(
        <IdentityKitProvider rpcUrl={rpcUrl} neynarApiKey={neynarApiKey} farcasterHub={farcasterHub} network={network} registryAddress={registryAddress} baseUrl={baseUrl}>
          <ThurinCard {...props} theme={t} />
        </IdentityKitProvider>,
      )
    render(theme)

    // A host page that switches themes sets data-theme on the element; follow it.
    new MutationObserver(() => {
      render((el.dataset.theme as Theme) || 'thurin')
    }).observe(el, { attributes: true, attributeFilter: ['data-theme'] })
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
