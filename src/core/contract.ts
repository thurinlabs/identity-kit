export const REGISTRY_ADDRESS = '0xf7a45BC662A78a6fb417ED5f52b3766cbf13EbBb' as const

export const CONTRACT_DEPLOY_BLOCK = 24515891n

export const REGISTRY_ABI = [
  {
    name: 'Attested',
    type: 'event',
    inputs: [
      { name: 'ethAddress', type: 'address', indexed: true },
      { name: 'fingerprintHash', type: 'string', indexed: true },
      { name: 'fingerprint', type: 'string', indexed: false },
      { name: 'pgpSignature', type: 'string', indexed: false },
      { name: 'pgpPublicKey', type: 'string', indexed: false },
      { name: 'index', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'attestationCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getAttestation',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'addr', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [
      { name: 'fingerprint', type: 'string' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'revoked', type: 'bool' },
    ],
  },
] as const
