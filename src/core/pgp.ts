import type { PGPKeyInfo, PGPVerification } from './types'

export async function parsePgpKey(armoredKey: string): Promise<PGPKeyInfo | null> {
  try {
    const { readKey } = await import('openpgp')
    const key = await readKey({ armoredKey })
    const fingerprint = key.getFingerprint().toUpperCase()
    const algorithm = String(key.keyPacket.algorithm)
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
