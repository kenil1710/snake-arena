import type { Direction, GameState, PowerUpType } from '@snake-arena/shared';
import { BACKEND_URL } from './contracts';

/**
 * Wire format returned by every backend session endpoint: the shared GameState
 * plus the engine's extra fields (mirrors WireGameState in
 * apps/backend/src/routes/session.ts).
 */
export interface WireGameState extends GameState {
  grid: { width: number; height: number };
  applesEaten: number;
  multiplierApplesRemaining: number;
  ticks: number;
  cheatFlags: string[];
}

/** Shape of POST /api/session/end — everything submitScore needs. */
export interface SignedScore {
  tournamentId: number;
  walletAddress: `0x${string}`;
  score: number;
  nonce: `0x${string}`;
  signature: `0x${string}`;
  contractAddress: `0x${string}`;
  chainId: number;
}

/** Backend error envelope; `state` rides along on 409s from /move and /powerup. */
export class GameApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly state?: WireGameState,
  ) {
    super(message);
    this.name = 'GameApiError';
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GameApiError(
      'BACKEND_UNREACHABLE',
      `Game server is unreachable at ${BACKEND_URL} — is the backend running?`,
      0,
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GameApiError(
      typeof payload.error === 'string' ? payload.error : 'UNKNOWN',
      typeof payload.message === 'string' ? payload.message : `Request failed (${response.status})`,
      response.status,
      payload.state as WireGameState | undefined,
    );
  }
  return payload as T;
}

export function startSession(params: {
  walletAddress: string;
  tournamentId: number;
  entryTxHash: string;
}): Promise<{ sessionId: `0x${string}`; initialState: WireGameState }> {
  return post('/api/session/start', params);
}

export function sendMove(params: {
  sessionId: string;
  direction: Direction;
}): Promise<{ state: WireGameState; moveAccepted: boolean }> {
  return post('/api/session/move', params);
}

export function activatePowerUp(params: {
  sessionId: string;
  powerUpType: PowerUpType;
  txHash: string;
}): Promise<{ state: WireGameState }> {
  return post('/api/session/powerup', params);
}

export function endSession(params: { sessionId: string }): Promise<SignedScore> {
  return post('/api/session/end', params);
}
