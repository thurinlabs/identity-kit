// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { identityErrorKind, needsRpcProbe } from '../identityError'

const ok = { ensEmpty: false, ensFailed: false, claimsFailed: false }

describe('identityErrorKind: a dead RPC is never reported as a fact about the identity', () => {
  it('stays quiet when nothing failed', () => {
    expect(needsRpcProbe(ok)).toBe(false)
    expect(identityErrorKind({ ...ok, rpcAnswered: undefined })).toBeNull()
  })
  it('waits for the probe before deciding', () => {
    expect(needsRpcProbe({ ...ok, ensEmpty: true })).toBe(true)
    expect(identityErrorKind({ ...ok, ensEmpty: true, rpcAnswered: undefined })).toBeNull()
  })
  it('an empty ENS result with a dead RPC is an RPC failure, not "no address"', () => {
    expect(identityErrorKind({ ...ok, ensEmpty: true, rpcAnswered: false })).toBe('rpc')
  })
  it('an empty ENS result with a live RPC is a name with no address', () => {
    expect(identityErrorKind({ ...ok, ensEmpty: true, rpcAnswered: true })).toBe('not-found')
  })
  it('a failed claims read with a dead RPC is an RPC failure', () => {
    expect(identityErrorKind({ ...ok, claimsFailed: true, rpcAnswered: false })).toBe('rpc')
  })
  it('a failed read with a live RPC is a read failure', () => {
    expect(identityErrorKind({ ...ok, claimsFailed: true, rpcAnswered: true })).toBe('read')
    expect(identityErrorKind({ ...ok, ensFailed: true, ensEmpty: true, rpcAnswered: true })).toBe('read')
  })
})
