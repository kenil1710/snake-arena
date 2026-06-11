import { describe, expect, it } from 'vitest';
import { SnakeGame } from '../src/game-engine/snake.js';
import {
  isOppositeDirection,
  MAX_MOVES_PER_SECOND,
  MoveRateLimiter,
} from '../src/game-engine/validator.js';

describe('anti-cheat — 180° turns', () => {
  it('detects opposite direction pairs symmetrically', () => {
    expect(isOppositeDirection('UP', 'DOWN')).toBe(true);
    expect(isOppositeDirection('DOWN', 'UP')).toBe(true);
    expect(isOppositeDirection('LEFT', 'RIGHT')).toBe(true);
    expect(isOppositeDirection('RIGHT', 'LEFT')).toBe(true);
    expect(isOppositeDirection('UP', 'LEFT')).toBe(false);
    expect(isOppositeDirection('UP', 'UP')).toBe(false);
  });

  it('rejects a 180° turn: input ignored, heading preserved, no cheat flag', () => {
    const game = new SnakeGame({ seed: 1, initialApple: { x: 0, y: 0 } });

    const result = game.applyMove('LEFT', 0); // currently heading RIGHT
    expect(result).toEqual({ accepted: false, reason: 'REVERSAL' });
    expect(game.serialize(0).direction).toBe('RIGHT');
    expect(game.cheatFlagCount).toBe(0); // input races are not hostile

    const state = game.step(0); // the tick still advances on the old heading
    expect(state.snake[0]).toEqual({ x: 11, y: 10 });
  });

  it('accepts perpendicular turns', () => {
    const game = new SnakeGame({ seed: 1 });
    expect(game.applyMove('UP', 0)).toEqual({ accepted: true });
    expect(game.serialize(0).direction).toBe('UP');
  });
});

describe('anti-cheat — move rate limiting', () => {
  it('flags and rejects moves beyond 20 per rolling second', () => {
    const game = new SnakeGame({ seed: 1, initialApple: { x: 0, y: 0 } });

    for (let i = 0; i < MAX_MOVES_PER_SECOND; i++) {
      expect(game.applyMove('RIGHT', 0).accepted).toBe(true);
    }

    const rejected = game.applyMove('RIGHT', 0);
    expect(rejected).toEqual({ accepted: false, reason: 'RATE_LIMITED' });
    expect(game.cheatFlagCount).toBe(1);
    expect(game.serialize(0).cheatFlags).toContain('MOVE_RATE_EXCEEDED');

    // Every further attempt inside the window keeps getting flagged.
    for (let i = 0; i < 5; i++) game.applyMove('RIGHT', 10 + i);
    expect(game.cheatFlagCount).toBe(6);
  });

  it('accepts moves again once the window slides past', () => {
    const game = new SnakeGame({ seed: 1 });
    for (let i = 0; i < MAX_MOVES_PER_SECOND; i++) game.applyMove('RIGHT', 0);
    expect(game.applyMove('RIGHT', 0).accepted).toBe(false);

    expect(game.applyMove('RIGHT', 1001).accepted).toBe(true);
  });

  it('never flags a normally paced player (10 moves/sec)', () => {
    const game = new SnakeGame({ seed: 1, initialApple: { x: 0, y: 0 } });
    for (let i = 0; i < 40; i++) {
      // Circle a 2x2 block so the snake stays in bounds forever.
      const direction = (['RIGHT', 'DOWN', 'LEFT', 'UP'] as const)[i % 4];
      expect(game.applyMove(direction, i * 100).accepted).toBe(true);
      game.step(i * 100);
    }
    expect(game.cheatFlagCount).toBe(0);
    expect(game.serialize(0).alive).toBe(true);
  });

  it('caps stored cheat flags so a spammer cannot grow memory unboundedly', () => {
    const game = new SnakeGame({ seed: 1 });
    for (let i = 0; i < 1200; i++) game.applyMove('RIGHT', 0);
    expect(game.cheatFlagCount).toBeLessThanOrEqual(1000);
  });

  it('MoveRateLimiter allows exactly the window capacity', () => {
    const limiter = new MoveRateLimiter(20, 1000);
    for (let i = 0; i < 20; i++) expect(limiter.allow(500)).toBe(true);
    expect(limiter.allow(500)).toBe(false);
    expect(limiter.allow(1499)).toBe(false); // 500 is still inside (1499 - 1000, 1499]
    expect(limiter.allow(1501)).toBe(true); // window drained
  });
});
