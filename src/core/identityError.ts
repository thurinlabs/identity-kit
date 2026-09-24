/**
 * Why an identity couldn't be shown. A dead RPC must never read as a fact about the identity:
 * viem's ENS lookup turns an unreachable RPC into "no address", and a failed registry read
 * leaves every count at zero. So when a lookup comes back empty or fails, the hook asks the
 * RPC for the block number and this decides which it was.
 *
 * - `rpc`: the RPC didn't answer; nothing about the identity is known
 * - `not-found`: the RPC answered and the ENS name has no address
 * - `read`: the RPC answers, but a registry read failed anyway
 */
export type IdentityErrorKind = 'rpc' | 'not-found' | 'read'

export interface IdentityLookupState {
  /** An ENS name was looked up and came back with no address. */
  ensEmpty: boolean
  /** The ENS lookup itself errored. */
  ensFailed: boolean
  /** Reading the owner's claims from the registry errored. */
  claimsFailed: boolean
  /** The block-number probe: undefined while not run or running. */
  rpcAnswered: boolean | undefined
}

/** Whether the lookup needs the RPC probe to be understood. */
export function needsRpcProbe(s: Omit<IdentityLookupState, 'rpcAnswered'>): boolean {
  return s.ensEmpty || s.ensFailed || s.claimsFailed
}

/** null when nothing went wrong or the probe hasn't answered yet. */
export function identityErrorKind(s: IdentityLookupState): IdentityErrorKind | null {
  if (!needsRpcProbe(s) || s.rpcAnswered === undefined) return null
  if (!s.rpcAnswered) return 'rpc'
  if (s.ensEmpty && !s.ensFailed) return 'not-found'
  return 'read'
}

export const IDENTITY_ERROR_TEXT: Record<IdentityErrorKind, string> = {
  rpc: "Couldn't reach the RPC, so nothing here is known yet.",
  'not-found': 'No address for this name.',
  read: "Couldn't read the registry.",
}
