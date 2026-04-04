import type { PGPKeyInfo, PGPVerification } from './types'

export async function parsePgpKey(armoredKey: string): Promise<PGPKeyInfo | null> {
  try {
    const { readKey } = await import('openpgp')
    const key = await readKey({ armoredKey })
    const fingerprint = key.getFingerprint().toUpperCase()
    const userIDs = key.users.map((u: any) => u.userID?.userID).filter(Boolean)
    const algorithm = String(key.keyPacket.algorithm)
    const created = key.keyPacket.created?.toISOString() ?? null
    const expiration = await key.getExpirationTime()
    const expires =
      expiration && expiration !== Infinity
        ? new Date(expiration as number).toISOString()
        : null

    const notations: { name: string; value: string }[] = []
    const seen = new Set<string>()
    for (const user of key.users) {
      if (!(user as any).selfCertifications) continue
      for (const cert of (user as any).selfCertifications) {
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
              const key = `${name}:${value}`
              if (!seen.has(key)) {
                seen.add(key)
                notations.push({ name, value })
              }
            }
          }
        }
      }
    }

    const subkeys = key.subkeys.map((sk: any) => ({
      algorithm: String(sk.keyPacket.algorithm),
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
    const { signatures } = await verify({ message, verificationKeys: publicKey })
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
