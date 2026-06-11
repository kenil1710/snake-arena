import type { Direction } from '@snake-arena/shared';

/** Anti-cheat: maximum accepted move/tick requests per rolling second. */
export const MAX_MOVES_PER_SECOND = 20;

export const DIRECTION_VECTORS: Record<Direction, { x: number; y: number }> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const OPPOSITES: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

/** A 180° turn would have the snake reverse into its own neck — never legal. */
export function isOppositeDirection(a: Direction, b: Direction): boolean {
  return OPPOSITES[a] === b;
}

/**
 * Sliding-window rate limiter for move requests. Only accepted moves are
 * recorded, so a spam burst is rejected (and flagged by the caller) without
 * permanently locking out the session once the window drains.
 */
export class MoveRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxPerWindow: number = MAX_MOVES_PER_SECOND,
    private readonly windowMs: number = 1000,
  ) {}

  /** Returns true and records the move if it fits in the window; false otherwise. */
  allow(nowMs: number): boolean {
    const cutoff = nowMs - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
    if (this.timestamps.length >= this.maxPerWindow) return false;
    this.timestamps.push(nowMs);
    return true;
  }
}
