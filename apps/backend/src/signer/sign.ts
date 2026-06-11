import { randomBytes } from 'node:crypto';
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Must mirror SnakeArena.submitScore exactly:
 *   keccak256(abi.encode(tournamentId, msg.sender, score, nonce, address(this), block.chainid))
 * The contract address + chain id bind a signature to one deployment on one chain.
 */
export const SCORE_MESSAGE_PARAMS = parseAbiParameters(
  'uint256, address, uint256, bytes32, address, uint256',
);

export interface ScoreSignRequest {
  tournamentId: bigint;
  player: Address;
  score: bigint;
  nonce: Hex;
  contractAddress: Address;
  chainId: bigint;
}

/** The raw digest the contract reconstructs before applying the EIP-191 prefix. */
export function buildScoreDigest(request: ScoreSignRequest): Hex {
  return keccak256(
    encodeAbiParameters(SCORE_MESSAGE_PARAMS, [
      request.tournamentId,
      request.player,
      request.score,
      request.nonce,
      request.contractAddress,
      request.chainId,
    ]),
  );
}

/** Cryptographically random single-use bytes32 nonce. */
export function generateNonce(): Hex {
  return `0x${randomBytes(32).toString('hex')}` as Hex;
}

export interface ScoreSigner {
  /** Address the contract must have configured as `trustedSigner`. */
  address: Address;
  signScore(request: ScoreSignRequest): Promise<Hex>;
}

export function createScoreSigner(privateKey: Hex): ScoreSigner {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    /**
     * signMessage({ raw }) prefixes "\x19Ethereum Signed Message:\n32" (EIP-191)
     * before signing — the exact counterpart of
     * MessageHashUtils.toEthSignedMessageHash(bytes32) used in SnakeArena.
     */
    async signScore(request) {
      const digest = buildScoreDigest(request);
      return account.signMessage({ message: { raw: digest } });
    },
  };
}
