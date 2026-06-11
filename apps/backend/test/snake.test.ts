import { describe, expect, it } from 'vitest';
import { GRID_HEIGHT, GRID_WIDTH } from '@snake-arena/shared';
import {
  MULTIPLIER_APPLE_COUNT,
  POINTS_PER_APPLE,
  SLOW_MO_DURATION_MS,
  SnakeGame,
} from '../src/game-engine/snake.js';
import { mulberry32 } from '../src/game-engine/rng.js';

const SEED = 1234;

function newGame(overrides: Partial<ConstructorParameters<typeof SnakeGame>[0]> = {}) {
  return new SnakeGame({ seed: SEED, ...overrides });
}

/** Steps the snake straight into the right wall from the default center start. */
function driveIntoRightWall(game: SnakeGame): void {
  // Head starts at x=10 heading RIGHT; 9 steps reach x=19, the 10th hits the wall.
  for (let i = 0; i < 10; i++) game.step(i * 100);
}

describe('SnakeGame — initial state', () => {
  it('starts a length-3 snake in the center heading RIGHT on a 20x20 grid', () => {
    const state = newGame().serialize(0);
    expect(state.grid).toEqual({ width: 20, height: 20 });
    expect(state.snake).toEqual([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    expect(state.direction).toBe('RIGHT');
    expect(state.score).toBe(0);
    expect(state.alive).toBe(true);
    expect(state.multiplier).toBe(1);
    expect(state.shield).toBe(false);
    expect(state.slowMo).toEqual({ active: false, until: 0 });
  });

  it('never spawns the initial apple on the snake or out of bounds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const state = new SnakeGame({ seed }).serialize(0);
      expect(state.apple).not.toBeNull();
      const apple = state.apple!;
      expect(apple.x).toBeGreaterThanOrEqual(0);
      expect(apple.x).toBeLessThan(GRID_WIDTH);
      expect(apple.y).toBeGreaterThanOrEqual(0);
      expect(apple.y).toBeLessThan(GRID_HEIGHT);
      expect(state.snake.some((s) => s.x === apple.x && s.y === apple.y)).toBe(false);
    }
  });
});

describe('SnakeGame — movement and collisions', () => {
  it('moves the head one cell per step without growing', () => {
    const game = newGame({ initialApple: { x: 0, y: 0 } });
    const state = game.step(0);
    expect(state.snake[0]).toEqual({ x: 11, y: 10 });
    expect(state.snake).toHaveLength(3);
    expect(state.ticks).toBe(1);
  });

  it('dies on wall collision and stays in its last safe position', () => {
    const game = newGame({ initialApple: { x: 0, y: 0 } });
    driveIntoRightWall(game);
    const state = game.serialize(0);
    expect(state.alive).toBe(false);
    expect(state.snake[0]).toEqual({ x: 19, y: 10 }); // fatal move never applied
  });

  it('dies when running into its own body', () => {
    const game = newGame({
      // Head (5,5) with the body hooked above it; moving UP hits segment (5,4).
      initialSnake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 6, y: 4 },
      ],
      initialDirection: 'RIGHT',
      initialApple: { x: 15, y: 15 },
    });
    expect(game.applyMove('UP', 0).accepted).toBe(true);
    const state = game.step(0);
    expect(state.alive).toBe(false);
  });

  it('does not count the vacating tail cell as a collision', () => {
    const game = newGame({
      // 2x2 loop: the head moves into the cell the tail leaves this same tick.
      initialSnake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 4 },
        { x: 5, y: 4 },
      ],
      initialDirection: 'UP',
      initialApple: { x: 15, y: 15 },
    });
    const state = game.step(0);
    expect(state.alive).toBe(true);
    expect(state.snake[0]).toEqual({ x: 5, y: 4 });
  });

  it('ignores further steps once dead', () => {
    const game = newGame({ initialApple: { x: 0, y: 0 } });
    driveIntoRightWall(game);
    const before = game.serialize(0);
    const after = game.step(2000);
    expect(after.snake).toEqual(before.snake);
    expect(after.ticks).toBe(before.ticks);
    expect(after.alive).toBe(false);
  });
});

describe('SnakeGame — apples and scoring', () => {
  it('eating an apple scores, grows the snake, and spawns a fresh apple off-snake', () => {
    const game = newGame({ initialApple: { x: 11, y: 10 } });
    const state = game.step(0);

    expect(state.score).toBe(POINTS_PER_APPLE);
    expect(state.applesEaten).toBe(1);
    expect(state.snake).toHaveLength(4); // grew: tail kept this tick
    expect(state.snake[0]).toEqual({ x: 11, y: 10 });
    expect(state.snake[3]).toEqual({ x: 8, y: 10 });

    expect(state.apple).not.toBeNull();
    expect(state.apple).not.toEqual({ x: 11, y: 10 });
    expect(state.snake.some((s) => s.x === state.apple!.x && s.y === state.apple!.y)).toBe(false);
  });

  it('is fully deterministic for the same seed and move script', () => {
    const script = (game: SnakeGame) => {
      game.step(0);
      game.applyMove('DOWN', 100);
      game.step(100);
      game.step(200);
      game.applyMove('LEFT', 300);
      game.step(300);
      return game.serialize(0);
    };
    const a = script(new SnakeGame({ seed: 42 }));
    const b = script(new SnakeGame({ seed: 42 }));
    expect(a).toEqual(b);
  });

  it('mulberry32 yields an identical sequence for an identical seed', () => {
    const a = mulberry32(987);
    const b = mulberry32(987);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('SnakeGame — power-ups', () => {
  it('shield blocks exactly one collision, then is consumed', () => {
    const game = newGame({ initialApple: { x: 0, y: 0 } });
    expect(game.activatePowerUp('shield', 0)).toBe(true);
    expect(game.serialize(0).shield).toBe(true);

    driveIntoRightWall(game); // 10th step hits the wall — shield absorbs it
    let state = game.serialize(0);
    expect(state.alive).toBe(true);
    expect(state.shield).toBe(false);
    expect(state.snake[0]).toEqual({ x: 19, y: 10 });

    state = game.step(1100); // second wall hit, no shield left
    expect(state.alive).toBe(false);
  });

  it('shield cannot stack', () => {
    const game = newGame();
    expect(game.activatePowerUp('shield', 0)).toBe(true);
    expect(game.activatePowerUp('shield', 0)).toBe(false);
  });

  it('2x multiplier doubles apple points while active', () => {
    const game = newGame({ initialApple: { x: 11, y: 10 } });
    expect(game.activatePowerUp('multiplier_2x', 0)).toBe(true);

    const state = game.step(0);
    expect(state.score).toBe(POINTS_PER_APPLE * 2);
    expect(state.multiplier).toBe(2);
    expect(state.multiplierApplesRemaining).toBe(MULTIPLIER_APPLE_COUNT - 1);
  });

  it('2x multiplier expires after exactly 10 apples', () => {
    const game = newGame({ initialApple: { x: 11, y: 10 } });
    game.activatePowerUp('multiplier_2x', 0);

    // Eat 9 apples straight along the row (x = 11..19)...
    for (let x = 11; x <= 19; x++) {
      game.placeApple({ x, y: 10 });
      expect(game.step(x * 50).applesEaten).toBe(x - 10);
    }
    // ...then turn down for the 10th so we don't hit the wall.
    game.applyMove('DOWN', 1000);
    game.placeApple({ x: 19, y: 11 });
    const state = game.step(1000);

    expect(state.applesEaten).toBe(10);
    expect(state.score).toBe(10 * POINTS_PER_APPLE * 2); // all 10 doubled
    expect(state.multiplier).toBe(1); // expired
    expect(state.multiplierApplesRemaining).toBe(0);
    expect(state.snake).toHaveLength(13);
  });

  it('slow-mo flags the state for its duration but never affects scoring', () => {
    const t0 = 1_000_000;
    const game = newGame({ initialApple: { x: 11, y: 10 } });
    expect(game.activatePowerUp('slowmo', t0)).toBe(true);

    let state = game.serialize(t0 + 1);
    expect(state.slowMo).toEqual({ active: true, until: t0 + SLOW_MO_DURATION_MS });

    state = game.step(t0 + 100); // eat an apple during slow-mo
    expect(state.score).toBe(POINTS_PER_APPLE); // unchanged scoring

    state = game.serialize(t0 + SLOW_MO_DURATION_MS + 1);
    expect(state.slowMo.active).toBe(false);
  });

  it('revive flips a dead game back to alive; the run continues', () => {
    const game = newGame({ initialApple: { x: 0, y: 0 } });
    expect(game.activatePowerUp('revive', 0)).toBe(false); // not while alive

    driveIntoRightWall(game);
    expect(game.serialize(0).alive).toBe(false);

    expect(game.activatePowerUp('revive', 1100)).toBe(true);
    expect(game.serialize(1100).alive).toBe(true);

    // Steer away from the wall and keep playing.
    expect(game.applyMove('UP', 1200).accepted).toBe(true);
    const state = game.step(1200);
    expect(state.alive).toBe(true);
    expect(state.snake[0]).toEqual({ x: 19, y: 9 });
  });

  it('power-ups other than revive cannot be activated while dead', () => {
    const game = newGame({ initialApple: { x: 0, y: 0 } });
    driveIntoRightWall(game);
    expect(game.activatePowerUp('shield', 2000)).toBe(false);
    expect(game.activatePowerUp('multiplier_2x', 2000)).toBe(false);
    expect(game.activatePowerUp('slowmo', 2000)).toBe(false);
  });
});
