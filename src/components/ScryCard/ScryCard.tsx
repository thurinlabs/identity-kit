import { useScryIdentity } from '../../hooks/useScryIdentity'
import { useIdentityKitConfig } from '../../context'
import type { Theme } from '../../core/types'
import '../../themes/index.css'
import './ScryCard.css'

function ThurinLogo() {
  return (
    <svg className="scry-card-avatar-placeholder" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50" fill="var(--scry-surface-deep)" />
      <path d="M25 80 Q25 25 50 25 Q75 25 75 50" fill="none" stroke="#7c9a3e" strokeWidth="4" strokeLinecap="round"/>
      <path d="M33 75 Q33 35 50 35 Q67 35 67 52" fill="none" stroke="#7c9a3e" strokeWidth="4" strokeLinecap="round"/>
      <path d="M41 70 Q41 45 50 45 Q59 45 59 55" fill="none" stroke="#c9a227" strokeWidth="4" strokeLinecap="round"/>
      <path d="M50 65 L50 53" fill="none" stroke="#c9a227" strokeWidth="4" strokeLinecap="round"/>
    </svg>
  )
}

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
    ? `${config.scryBaseUrl}/eth/${identity.address}`
    : ens
      ? `${config.scryBaseUrl}/ens/${ens}`
      : null

  if (identity.isLoading) {
    return (
      <div className="scry-card" data-scry-theme={theme}>
        <div className="scry-card-loading">Loading identity...</div>
      </div>
    )
  }

  const displayAddress = identity.address || null

  const verifiedProofs = identity.proofs.filter((p) => p.status === 'verified').length
  const hasVerifiedPgp = identity.claims.some((c) => c.verification?.verified && !c.revoked)

  return (
    <div className="scry-card" data-scry-theme={theme}>
      <a className="scry-card-header" href={scryUrl || undefined} target="_blank" rel="noopener noreferrer">
        {identity.ensAvatar ? (
          <img
            className="scry-card-avatar"
            src={identity.ensAvatar}
            alt={identity.ensName || ''}
          />
        ) : (
          <ThurinLogo />
        )}
        <div>
          {identity.ensName && (
            <div className="scry-card-name">{identity.ensName}</div>
          )}
          {displayAddress && (
            <div className="scry-card-address">{displayAddress}</div>
          )}
        </div>
      </a>

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
