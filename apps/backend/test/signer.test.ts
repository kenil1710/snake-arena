import { describe, expect, it } from 'vitest';
import { recoverMessageAddress, size, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildScoreDigest,
  createScoreSigner,
  generateNonce,
  type ScoreSignRequest,
} from '../src/signer/sign.js';

// Well-known anvil test key #0 — never used outside tests.
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const TEST_ADDRESS = privateKeyToAccount(TEST_KEY).address;

// Mirrors the live deployment so the fixture is realistic.
const ARENA = '0xd25B8F3dfE7B9C5af8a4eE5aD86543918429D49a' as Address;

const request: ScoreSignRequest = {
  tournamentId: 7n,
  player: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  score: 1230n,
  nonce: `0x${'11'.repeat(32)}` as Hex,
  contractAddress: ARENA,
  chainId: 84532n,
};

describe('score signer', () => {
  it('produces 65-byte ECDSA signatures', async () => {
    const signer = createScoreSigner(TEST_KEY);
    const signature = await signer.signScore(request);
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/i);
    expect(size(signature)).toBe(65);
  });

  it('signs deterministically (RFC 6979): same message, same signature', async () => {
    const signer = createScoreSigner(TEST_KEY);
    const first = await signer.signScore(request);
    const second = await signer.signScore(request);
    expect(first).toBe(second);
  });

  it('any field change yields a different digest and signature', async () => {
    const signer = createScoreSigner(TEST_KEY);
    const base = await signer.signScore(request);

    const variants: ScoreSignRequest[] = [
      { ...request, score: 1231n },
      { ...request, tournamentId: 8n },
      { ...request, nonce: `0x${'22'.repeat(32)}` as Hex },
      { ...request, chainId: 8453n },
      { ...request, contractAddress: '0x115FCF24E31AA3B970aaf4Be27BbB4e45dbc2ec7' },
    ];
    for (const variant of variants) {
      expect(buildScoreDigest(variant)).not.toBe(buildScoreDigest(request));
      expect(await signer.signScore(variant)).not.toBe(base);
    }
  });

  it('recovers the trusted signer address from the EIP-191 prefixed digest', async () => {
    const signer = createScoreSigner(TEST_KEY);
    const signature = await signer.signScore(request);

    // Exactly what SnakeArena.submitScore does:
    //   digest.toEthSignedMessageHash().recover(signature) == trustedSigner
    const recovered = await recoverMessageAddress({
      message: { raw: buildScoreDigest(request) },
      signature,
    });
    expect(recovered).toBe(TEST_ADDRESS);
    expect(recovered).toBe(signer.address);
  });

  it('builds a 32-byte digest', () => {
    expect(size(buildScoreDigest(request))).toBe(32);
  });

  it('generates unique, well-formed bytes32 nonces', () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
      nonces.add(nonce);
    }
    expect(nonces.size).toBe(200);
  });
});
