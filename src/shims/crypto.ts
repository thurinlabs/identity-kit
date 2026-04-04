// Browser shim — openpgp uses Web Crypto API at runtime,
// but the CJS entry tries to require('crypto') at init.
// This redirects to the browser's native crypto.
export default globalThis.crypto
export const webcrypto = globalThis.crypto
export const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n))
export const createHash = undefined
export const createHmac = undefined
