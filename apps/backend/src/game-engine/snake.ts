import {
  GRID_WIDTH,
  GRID_HEIGHT,
  type Direction,
  type Position,
  type PowerUpType,
} from '@snake-arena/shared';
import { mulberry32 } from './rng.js';
import { DIRECTION_VECTORS, isOppositeDirection, MoveRateLimiter } from './validator.js';

/** Points per apple before multipliers. */
export const POINTS_PER_APPLE = 10;
/** The 2x multiplier applies to this many apples after activation. */
export const MULTIPLIER_APPLE_COUNT = 10;
/** Slow-mo lasts this long after activation. */
export const SLOW_MO_DURATION_MS = 10_000;
/** Cap on stored cheat flags so an abusive client can't grow memory unboundedly. */
const MAX_STORED_CHEAT_FLAGS = 1_000;

/** Engine-level snapshot of a game (the session id is added at the API layer). */
export interface EngineState {
  grid: { width: number; height: number };
  /** Head first. */
  snake: Position[];
  direction: Direction;
  /** Null only when the snake fills the entire board. */
  apple: Position | null;
  score: number;
  applesEaten: number;
  multiplier: number;
  multiplierApplesRemaining: number;
  shield: boolean;
  slowMo: { active: boolean; until: number };
  alive: boolean;
  ticks: number;
  cheatFlags: string[];
}

export type MoveRejection = 'GAME_OVER' | 'RATE_LIMITED' | 'REVERSAL';

export interface MoveResult {
  accepted: boolean;
  reason?: MoveRejection;
}

export interface SnakeGameOptions {
  /** Seed for deterministic apple placement (stored in the session for replays). */
  seed: number;
  /** Test/replay hooks — production sessions use the defaults. */
  initialSnake?: Position[];
  initialDirection?: Direction;
  initialApple?: Position;
}

/**
 * Server-authoritative snake game on a 20x20 grid.
 *
 * The client never reports game outcomes: it only sends direction inputs, the
 * server advances the simulation one tick per accepted move request and is the
 * sole source of truth for score, collisions, and power-up effects.
 *
 * Anti-cheat at this layer:
 * - 180° reversals are rejected (input ignored; the tick still advances).
 * - Move rate is capped at MAX_MOVES_PER_SECOND over a rolling window; moves
 *   beyond the cap are rejected without advancing the game and each violation
 *   is recorded in `cheatFlags`.
 */
export class SnakeGame {
  readonly seed: number;

  private rng: () => number;
  private snake: Position[];
  private direction: Direction;
  private apple: Position | null = null;
  private score = 0;
  private applesEaten = 0;
  private multiplierApplesRemaining = 0;
  private shield = false;
  private slowMoUntil = 0;
  private alive = true;
  private ticks = 0;
  private cheatFlags: string[] = [];
  private rateLimiter = new MoveRateLimiter();

  constructor(options: SnakeGameOptions) {
    this.seed = options.seed;
    this.rng = mulberry32(options.seed);

    const cx = Math.floor(GRID_WIDTH / 2);
    const cy = Math.floor(GRID_HEIGHT / 2);
    this.snake = options.initialSnake?.map((p) => ({ ...p })) ?? [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    this.direction = options.initialDirection ?? 'RIGHT';
    this.apple = options.initialApple ? { ...options.initialApple } : this.pickAppleCell();
  }

  /**
   * Validates and applies a direction input. Does not advance the simulation —
   * call `step()` for that (the /move endpoint does both).
   */
  applyMove(direction: Direction, nowMs: number = Date.now()): MoveResult {
    if (!this.alive) return { accepted: false, reason: 'GAME_OVER' };

    if (!this.rateLimiter.allow(nowMs)) {
      this.recordCheatFlag('MOVE_RATE_EXCEEDED');
      return { accepted: false, reason: 'RATE_LIMITED' };
    }

    if (isOppositeDirection(direction, this.direction)) {
      // Invalid but not hostile (input races happen) — ignore, keep heading.
      return { accepted: false, reason: 'REVERSAL' };
    }

    this.direction = direction;
    return { accepted: true };
  }

  /** Advances the simulation one tick and returns the resulting state. */
  step(nowMs: number = Date.now()): EngineState {
    if (!this.alive) return this.serialize();

    const vector = DIRECTION_VECTORS[this.direction];
    const head = this.snake[0];
    const next: Position = { x: head.x + vector.x, y: head.y + vector.y };

    if (next.x < 0 || next.x >= GRID_WIDTH || next.y < 0 || next.y >= GRID_HEIGHT) {
      return this.handleCollision();
    }

    const growing = this.apple !== null && next.x === this.apple.x && next.y === this.apple.y;
    // The tail cell is vacated this tick unless we grow, so it is not a collision.
    const blocking = growing ? this.snake : this.snake.slice(0, -1);
    if (blocking.some((segment) => segment.x === next.x && segment.y === next.y)) {
      return this.handleCollision();
    }

    this.snake.unshift(next);
    if (growing) {
      this.applesEaten += 1;
      this.score += POINTS_PER_APPLE * (this.multiplierApplesRemaining > 0 ? 2 : 1);
      if (this.multiplierApplesRemaining > 0) this.multiplierApplesRemaining -= 1;
      this.apple = this.pickAppleCell();
    } else {
      this.snake.pop();
    }

    this.ticks += 1;
    return this.serialize(nowMs);
  }

  /**
   * Applies a (payment-verified) power-up. Returns false if it cannot apply in
   * the current state, in which case the caller should not consume the purchase.
   */
  activatePowerUp(type: PowerUpType, nowMs: number = Date.now()): boolean {
    switch (type) {
      case 'shield':
        if (!this.alive || this.shield) return false;
        this.shield = true;
        return true;
      case 'multiplier_2x':
        if (!this.alive) return false;
        this.multiplierApplesRemaining = MULTIPLIER_APPLE_COUNT;
        return true;
      case 'slowmo':
        if (!this.alive) return false;
        this.slowMoUntil = nowMs + SLOW_MO_DURATION_MS;
        return true;
      case 'revive':
        if (this.alive) return false;
        // The fatal move was never applied (the snake is intact in its last safe
        // position), so flipping `alive` resumes the run. One purchase = one life.
        this.alive = true;
        return true;
    }
  }

  serialize(nowMs: number = Date.now()): EngineState {
    return {
      grid: { width: GRID_WIDTH, height: GRID_HEIGHT },
      snake: this.snake.map((p) => ({ ...p })),
      direction: this.direction,
      apple: this.apple ? { ...this.apple } : null,
      score: this.score,
      applesEaten: this.applesEaten,
      multiplier: this.multiplierApplesRemaining > 0 ? 2 : 1,
      multiplierApplesRemaining: this.multiplierApplesRemaining,
      shield: this.shield,
      slowMo: { active: nowMs < this.slowMoUntil, until: this.slowMoUntil },
      alive: this.alive,
      ticks: this.ticks,
      cheatFlags: [...this.cheatFlags],
    };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get currentScore(): number {
    return this.score;
  }

  get cheatFlagCount(): number {
    return this.cheatFlags.length;
  }

  /** Test/replay hook: force the next apple position (server tests steer with this). */
  placeApple(position: Position): void {
    this.apple = { ...position };
  }

  private handleCollision(): EngineState {
    if (this.shield) {
      // Shield blocks exactly one collision: consumed, snake holds position.
      this.shield = false;
      this.ticks += 1;
      return this.serialize();
    }
    this.alive = false;
    return this.serialize();
  }

  /** Deterministic apple placement: uniform over free cells via the seeded PRNG. */
  private pickAppleCell(): Position | null {
    const occupied = new Set(this.snake.map((p) => p.y * GRID_WIDTH + p.x));
    const free: Position[] = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (!occupied.has(y * GRID_WIDTH + x)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null; // board full — nothing left to eat
    return free[Math.floor(this.rng() * free.length)];
  }

  private recordCheatFlag(flag: string): void {
    if (this.cheatFlags.length < MAX_STORED_CHEAT_FLAGS) this.cheatFlags.push(flag);
  }
}
