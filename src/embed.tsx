import { createRoot } from 'react-dom/client'
import { IdentityKitProvider } from './provider'
import { ScryCard } from './components/ScryCard/ScryCard'
import type { Theme } from './core/types'

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

function renderCards() {
  const elements = document.querySelectorAll<HTMLElement>('[data-scry-card]')
  if (elements.length === 0) return

  elements.forEach((el) => {
    // Skip if already rendered
    if (el.dataset.scryRendered) return
    el.dataset.scryRendered = 'true'

    const value = el.dataset.scryCard!
    const theme = (el.dataset.theme as Theme) || 'thurin'
    const props = isAddress(value) ? { address: value } : { ens: value }

    const root = createRoot(el)
    root.render(
      <IdentityKitProvider>
        <ScryCard {...props} theme={theme} />
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
        if (node.dataset.scryCard || node.querySelector('[data-scry-card]')) {
          renderCards()
          return
        }
      }
    }
  }
})

observer.observe(document.body, { childList: true, subtree: true })
