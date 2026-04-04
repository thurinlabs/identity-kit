import { useScryIdentity } from '../../hooks/useScryIdentity'
import { useIdentityKitConfig } from '../../context'
import type { Theme } from '../../core/types'
import './ScryCard.css'

export interface ScryCardProps {
  ens?: string
  address?: string
  theme?: Theme
}

export function ScryCard({ ens, address, theme = 'thurin' }: ScryCardProps) {
  const input = ens || address
  const identity = useScryIdentity(input)
  const config = useIdentityKitConfig()

  const scryUrl = identity.address
    ? `${config.scryBaseUrl}/#/eth/${identity.address}`
    : ens
      ? `${config.scryBaseUrl}/#/ens/${ens}`
      : null

  if (identity.isLoading) {
    return (
      <div className="scry-card" data-scry-theme={theme}>
        <div className="scry-card-loading">Loading identity...</div>
      </div>
    )
  }

  const truncatedAddress = identity.address
    ? `${identity.address.slice(0, 6)}...${identity.address.slice(-4)}`
    : null

  const verifiedProofs = identity.proofs.filter((p) => p.status === 'verified').length
  const hasVerifiedPgp = identity.claims.some((c) => c.verification?.verified && !c.revoked)

  return (
    <div className="scry-card" data-scry-theme={theme}>
      <div className="scry-card-header">
        {identity.ensAvatar ? (
          <img
            className="scry-card-avatar"
            src={identity.ensAvatar}
            alt={identity.ensName || ''}
          />
        ) : (
          <div className="scry-card-avatar-placeholder" />
        )}
        <div>
          {identity.ensName && (
            <div className="scry-card-name">{identity.ensName}</div>
          )}
          {truncatedAddress && (
            <div className="scry-card-address">{truncatedAddress}</div>
          )}
        </div>
      </div>

      <div className="scry-card-stats">
        <div className="scry-card-stat">
          <span className="scry-card-stat-value">{identity.activeClaims}</span>
          <span className="scry-card-stat-label">Seals</span>
        </div>
        <div className="scry-card-stat">
          <span className="scry-card-stat-value">{verifiedProofs}</span>
          <span className="scry-card-stat-label">Proofs</span>
        </div>
        <div className="scry-card-stat">
          <span className="scry-card-stat-value">
            {identity.efp?.followers ?? 0}
          </span>
          <span className="scry-card-stat-label">Followers</span>
        </div>
      </div>

      <div className="scry-card-badges">
        {hasVerifiedPgp && (
          <span className="scry-card-badge scry-card-badge--verified">PGP Verified</span>
        )}
        {identity.efp?.hasEfp && (
          <span className="scry-card-badge scry-card-badge--verified">EFP</span>
        )}
        {identity.proofs.map((p, i) => (
          <span
            key={i}
            className={`scry-card-badge scry-card-badge--${p.status === 'verified' ? 'verified' : 'unverified'}`}
          >
            {p.label}
          </span>
        ))}
      </div>

      {scryUrl && (
        <a
          className="scry-card-link"
          href={scryUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on Scry
        </a>
      )}
    </div>
  )
}
