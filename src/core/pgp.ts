import type { PGPKeyInfo, PGPVerification } from './types'

/**
 * openpgp.js refuses secp256k1 by default because RFC 9580 does not list the
 * curve — a compatibility choice, not a security one. A secp256k1 PGP key is a
 * valid key (and, incidentally, doubles as an Ethereum key: the address falls out
 * of the same public point). Thurin verifies signatures over any curve openpgp.js
 * can compute; whether a holder reuses such a key as a wallet is their business.
 * In Node, openpgp.js needs the optional `eckey-utils` package for this curve;
 * the browser build does not.
 */
const PGP_CONFIG = { rejectCurves: new Set() as Set<never> }

/** Human-readable algorithm for a key or subkey packet: "Ed25519", "Cv25519", "RSA 4096", "NIST P-256", … */
function algorithmName(keyOrSubkey: any): string {
  try {
    const info = keyOrSubkey.getAlgorithmInfo() as { algorithm: string; bits?: number; curve?: string }
    const curve = (info.curve || '').toLowerCase()
    if (curve.startsWith('ed25519') || info.algorithm === 'ed25519' || info.algorithm === 'eddsaLegacy') return 'Ed25519'
    if (curve.startsWith('curve25519') || info.algorithm === 'x25519') return 'Cv25519'
    if (curve.startsWith('ed448')) return 'Ed448'
    if (curve.startsWith('curve448') || info.algorithm === 'x448') return 'X448'
    if (curve.startsWith('nistp') || curve.startsWith('p')) return `NIST P-${curve.replace(/\D/g, '')}`
    if (curve.startsWith('secp')) return curve
    if (curve.startsWith('brainpool')) return curve
    if (info.algorithm.startsWith('rsa')) return info.bits ? `RSA ${info.bits}` : 'RSA'
    if (info.algorithm.startsWith('dsa')) return info.bits ? `DSA ${info.bits}` : 'DSA'
    if (info.algorithm.startsWith('elgamal')) return info.bits ? `ElGamal ${info.bits}` : 'ElGamal'
    return info.curve || info.algorithm
  } catch {
    return String(keyOrSubkey.keyPacket?.algorithm ?? 'unknown')
  }
}

export async function parsePgpKey(armoredKey: string): Promise<PGPKeyInfo | null> {
  try {
    const { readKey } = await import('openpgp')
    const key = await readKey({ armoredKey })
    const fingerprint = key.getFingerprint().toUpperCase()
    const algorithm = algorithmName(key)
    const created = key.keyPacket.created?.toISOString() ?? null
    const expiration = await key.getExpirationTime()
    const expires =
      expiration && expiration !== Infinity
        ? new Date(expiration as number).toISOString()
        : null

    // openpgp does not verify certification signatures when a key is parsed —
    // it groups them by issuer key ID only. A key's fingerprint also covers
    // only the primary key packet, not its user IDs or their certifications.
    // Each self-certification is therefore verified against the primary key
    // here before its user ID and notations are treated as authoritative.
    const userIDs: string[] = []
    const notations: { name: string; value: string }[] = []
    const seen = new Set<string>()
    for (const user of key.users) {
      const certs = (user as any).selfCertifications
      if (!certs || certs.length === 0) continue

      let userVerified = false
      for (const cert of certs) {
        try {
          await cert.verify(
            key.keyPacket,
            cert.signatureType,
            { userID: (user as any).userID, key: key.keyPacket },
            undefined,
            PGP_CONFIG,
          )
        } catch {
          continue // signature not made by this key — ignore this certification
        }
        userVerified = true

        if (cert.rawNotations) {
          for (const n of cert.rawNotations) {
            const name =
              typeof n.name === 'string' ? n.name : new TextDecoder().decode(n.name)
            const value =
              n.value instanceof Uint8Array
                ? new TextDecoder().decode(n.value)
                : typeof n.value === 'string'
                  ? n.value
                  : null
            if (value) {
              // Dedupe by value alone: the same proof target is often present
              // under both proof@thurin.id and proof@ariadne.id, and should
              // surface once, not once per namespace.
              if (!seen.has(value)) {
                seen.add(value)
                notations.push({ name, value })
              }
            }
          }
        }
      }

      if (userVerified) {
        const uid = (user as any).userID?.userID
        if (uid) userIDs.push(uid)
      }
    }

    const subkeys = key.subkeys.map((sk: any) => ({
      algorithm: algorithmName(sk),
      created: sk.keyPacket.created?.toISOString() ?? null,
      fingerprint: sk.getFingerprint().toUpperCase(),
    }))

    return { fingerprint, userIDs, algorithm, created, expires, notations, subkeys }
  } catch {
    return null
  }
}

export async function verifyAttestation({
  pgpPublicKey,
  pgpSignature,
  fingerprint,
  ethAddress,
}: {
  pgpPublicKey: string | null
  pgpSignature: string | null
  fingerprint: string
  ethAddress: string
}): Promise<PGPVerification> {
  try {
    if (!pgpPublicKey || !pgpSignature) {
      return { verified: false, reason: 'Missing PGP data' }
    }

    const { readKey, readCleartextMessage, verify } = await import('openpgp')

    const publicKey = await readKey({ armoredKey: pgpPublicKey })
    const keyFingerprint = publicKey.getFingerprint().toUpperCase()
    if (keyFingerprint !== fingerprint.toUpperCase()) {
      return { verified: false, reason: 'Key fingerprint mismatch' }
    }

    const message = await readCleartextMessage({ cleartextMessage: pgpSignature })
    const { signatures } = await verify({ message, verificationKeys: publicKey, config: PGP_CONFIG })
    await signatures[0].verified

    const signedText = message.getText()
    if (!signedText.toLowerCase().includes(ethAddress.toLowerCase())) {
      return { verified: false, reason: 'Signed message does not contain ETH address' }
    }

    return { verified: true }
  } catch {
    return { verified: false, reason: 'Signature verification failed' }
  }
}

export interface StrippedKey {
  /** Armored public key containing only the non-email user IDs. */
  armored: string
  /** User IDs kept (no `@`). */
  kept: string[]
  /** User IDs removed (contained an `@`). */
  removed: string[]
}

const EMAIL_UID = /@/

/**
 * Remove every user ID that contains an email address, keeping the rest (and
 * their self-certifications, so proof notations on a non-email user ID survive).
 * Returns null when nothing would remain — openpgp needs at least one
 * self-certified user ID to verify signatures, so such a key must not be
 * published. The key material and subkeys are untouched; the fingerprint is
 * unchanged.
 */
export async function stripEmailUserIDs(armoredKey: string): Promise<StrippedKey | null> {
  try {
    const { readKey } = await import('openpgp')
    const key = await readKey({ armoredKey })
    const kept: string[] = []
    const removed: string[] = []
    const users = (key as any).users.filter((u: any) => {
      const uid: string | undefined = u.userID?.userID
      if (!uid) return false
      if (EMAIL_UID.test(uid)) { removed.push(uid); return false }
      kept.push(uid)
      return true
    })
    if (users.length === 0) return null
    ;(key as any).users = users
    return { armored: key.armor(), kept, removed }
  } catch {
    return null
  }
}

/** True when any user ID on the key contains an email address. */
export async function hasEmailUserID(armoredKey: string): Promise<boolean> {
  try {
    const { readKey } = await import('openpgp')
    const key = await readKey({ armoredKey })
    return (key as any).users.some((u: any) => EMAIL_UID.test(u.userID?.userID ?? ''))
  } catch {
    return false
  }
}

const KEYSERVER_BASE = 'https://keys.openpgp.org/vks/v1'

export async function fetchKeyByFingerprint(fingerprint: string): Promise<string | null> {
  try {
    const resp = await fetch(`${KEYSERVER_BASE}/by-fingerprint/${fingerprint}`)
    if (!resp.ok) return null
    return await resp.text()
  } catch {
    return null
  }
}

export async function fetchKeyByKeyId(keyId: string): Promise<string | null> {
  try {
    const resp = await fetch(`${KEYSERVER_BASE}/by-keyid/${keyId}`)
    if (!resp.ok) return null
    return await resp.text()
  } catch {
    return null
  }
}
