import { useEffect, useState } from 'react'
import { useThurinIdentity } from '../../hooks/useThurinIdentity'
import { avatarFallbacks } from '../../core/avatar'
import { useIdentityKitConfig } from '../../context'
import type { Theme } from '../../core/types'
import '../../themes/index.css'
import './ThurinCard.css'

function ThurinLogo() {
  return (
    <svg className="thurin-card-avatar-placeholder" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50" fill="var(--thurin-surface-deep)" />
      <path d="M25 80 Q25 25 50 25 Q75 25 75 50" fill="none" stroke="#7c9a3e" strokeWidth="4" strokeLinecap="round"/>
      <path d="M33 75 Q33 35 50 35 Q67 35 67 52" fill="none" stroke="#7c9a3e" strokeWidth="4" strokeLinecap="round"/>
      <path d="M41 70 Q41 45 50 45 Q59 45 59 55" fill="none" stroke="#c9a227" strokeWidth="4" strokeLinecap="round"/>
      <path d="M50 65 L50 53" fill="none" stroke="#c9a227" strokeWidth="4" strokeLinecap="round"/>
    </svg>
  )
}

// The avatar, retried through the other IPFS gateways if one fails, then the logo.
function Avatar({ src, alt }: { src: string | null; alt: string }) {
  const [tries, setTries] = useState<string[]>([])
  useEffect(() => { setTries(src ? [src, ...avatarFallbacks(src)] : []) }, [src])
  if (!tries.length) return <ThurinLogo />
  return <img className="thurin-card-avatar" src={tries[0]} alt={alt} onError={() => setTries((t) => t.slice(1))} />
}

export interface ThurinCardProps {
  ens?: string
  address?: string
  theme?: Theme
}

export function ThurinCard({ ens, address, theme = 'thurin' }: ThurinCardProps) {
  const input = ens || address
  const identity = useThurinIdentity(input)
  const config = useIdentityKitConfig()

  const profileUrl = identity.address
    ? `${config.baseUrl}/eth/${identity.address}`
    : ens
      ? `${config.baseUrl}/ens/${ens}`
      : null

  if (identity.isLoading) {
    return (
      <div className="thurin-card" data-thurin-theme={theme}>
        <div className="thurin-card-loading">Loading identity...</div>
      </div>
    )
  }

  const displayAddress = identity.address || null

  // A failed lookup says so, instead of rendering zeros that read as facts.
  if (identity.errorKind) {
    return (
      <div className="thurin-card" data-thurin-theme={theme}>
        <div className="thurin-card-header">
          <ThurinLogo />
          <div>
            <div className="thurin-card-name">{identity.ensName || ens || address}</div>
          </div>
        </div>
        <div className="thurin-card-error" role="status">
          {identity.error?.message}
          {identity.errorKind !== 'not-found' && (
            <button type="button" className="thurin-card-retry" onClick={identity.retry}>Try again</button>
          )}
        </div>
        {profileUrl && identity.errorKind !== 'not-found' && (
          <a className="thurin-card-link" href={profileUrl} target="_blank" rel="noopener noreferrer">View on Thurin.id</a>
        )}
      </div>
    )
  }

  const verifiedProofs = identity.proofs.filter((p) => p.status === 'verified').length
  const hasVerifiedPgp = identity.claims.some((c) => c.verification?.verified && !c.revoked)

  return (
    <div className="thurin-card" data-thurin-theme={theme}>
      <a className="thurin-card-header" href={profileUrl || undefined} target="_blank" rel="noopener noreferrer">
        <Avatar src={identity.ensAvatar} alt={identity.ensName || ''} />
        <div>
          {identity.ensName && (
            <div className="thurin-card-name">{identity.ensName}</div>
          )}
          {displayAddress && (
            <div className="thurin-card-address">{displayAddress}</div>
          )}
        </div>
      </a>

      <div className="thurin-card-stats">
        <div className="thurin-card-stat">
          <span className="thurin-card-stat-value">{identity.activeClaims}</span>
          <span className="thurin-card-stat-label">Claims</span>
        </div>
        <div className="thurin-card-stat">
          <span className="thurin-card-stat-value">{verifiedProofs}</span>
          <span className="thurin-card-stat-label">Proofs</span>
        </div>
        <div className="thurin-card-stat">
          <span className="thurin-card-stat-value">
            {/* EFP answers separately; a null graph means it didn't, so don't claim zero. */}
            {identity.efp ? identity.efp.followers : '–'}
          </span>
          <span className="thurin-card-stat-label">Followers</span>
        </div>
      </div>

      <div className="thurin-card-badges">
        {hasVerifiedPgp && (
          <span className="thurin-card-badge thurin-card-badge--verified">PGP Verified</span>
        )}
        {identity.efp?.hasEfp && (
          <span className="thurin-card-badge thurin-card-badge--verified">EFP</span>
        )}
        {identity.proofs.map((p, i) => (
          <span
            key={i}
            className={`thurin-card-badge thurin-card-badge--${p.status === 'verified' ? 'verified' : 'unverified'}`}
          >
            {p.label}
          </span>
        ))}
      </div>

      {profileUrl && (
        <a
          className="thurin-card-link"
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on Thurin.id
        </a>
      )}
    </div>
  )
}
