// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sshKeys, leanKey } from '../pgp'

// Throwaway keys; the expected lines come from `gpg --export-ssh-key <fpr>!` and `ssh-keygen -l`.
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')
const expected: Record<string, { line: string; sha256: string; fingerprint: string }[]> = JSON.parse(fx('ssh-expected.json'))

describe('sshKeys', () => {
  for (const [name, want] of Object.entries(expected)) {
    it(`${name}: matches gpg`, async () => {
      expect(await sshKeys(fx(`ssh-${name}.asc`))).toEqual(want)
    })
  }

  it('reads the lean bytes a claim stores', async () => {
    const lean = await leanKey(fx('ssh-two.asc'))
    expect(await sshKeys(lean!.binary)).toEqual(expected.two)
  })

  it('gives nothing for input that is not a key', async () => {
    expect(await sshKeys('not a key')).toEqual([])
  })
})
