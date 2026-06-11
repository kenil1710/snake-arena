import { randomBytes } from 'node:crypto';

/**
 * mulberry32 — tiny deterministic PRNG. Given the same seed, the sequence of
 * values (and therefore every apple position) is fully reproducible, which lets
 * the server audit/replay a game from its session seed + move log.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cryptographically random 32-bit seed for a new game session. */
export function randomSeed(): number {
  return randomBytes(4).readUInt32LE(0);
}
