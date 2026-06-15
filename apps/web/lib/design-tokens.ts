/**
 * SnakeArena design tokens — "Night Garden Arcade" palette. Single source of
 * truth for color, radius, and shadow values. tailwind.config.ts builds the
 * theme from these, and runtime code (canvas, framer-motion, confetti) imports
 * them directly so the two never drift.
 *
 * Legacy names (teal / surfaceElevated / cyan …) are kept as aliases pointing
 * at garden values so existing class names and the few direct importers keep
 * working without a sweep.
 */

export const colors = {
  /** Deep garden night — dark green, never black. */
  background: '#04241f',
  /** Game board / gradient anchor — a touch lighter than the page. */
  boardBg: '#06302a',
  surface: '#085041',
  surfaceRaised: '#0a5e4c',
  border: '#0F6E56',
  borderBright: '#1D9E75',

  // --- Mascot / nature -------------------------------------------------------
  snake: '#C0DD97',
  snakeSpot: '#97C459',
  snakeHead: '#d4eda9',
  leaf: '#3B6D11',
  leafDark: '#27500A',
  berry: '#E24B4A',
  berryLeaf: '#639922',
  berrySeed: '#FCEBEB',

  // --- Accents ---------------------------------------------------------------
  /** Interactive text / links. */
  accent: '#5DCAA5',
  accentBright: '#9FE1CB',
  /** Gold — primary CTAs + coin badges. */
  coin: '#EF9F27',
  coinLight: '#FAC775',
  /** Dark brown text on gold. */
  coinText: '#412402',

  // --- Status ----------------------------------------------------------------
  gold: '#EF9F27',
  goldDark: '#d97706',
  silver: '#cbd5e1',
  bronze: '#d97706',
  live: '#34d399',
  danger: '#E24B4A',
  amber: '#f59e0b',
  usdcBlue: '#2775ca',

  // --- Text ------------------------------------------------------------------
  textPrimary: '#E1F5EE',
  textSecondary: '#9FE1CB',
  textMuted: 'rgba(93,202,165,0.6)',

  // --- Legacy aliases (do not remove — direct importers + class names) -------
  surfaceElevated: '#0a5e4c',
  surface3: '#06302a',
  borderSubtle: '#0F6E56',
  teal: '#5DCAA5',
  tealDeep: '#9FE1CB',
  tealSoft: '#9FE1CB',
  cyan: '#9FE1CB',
} as const;

export const gradients = {
  hero: `linear-gradient(135deg, ${colors.coinLight} 0%, ${colors.coin} 100%)`,
  prize: `linear-gradient(180deg, ${colors.accentBright} 0%, ${colors.accent} 100%)`,
  cardHover: 'radial-gradient(circle at top right, rgba(29,158,117,0.12) 0%, transparent 50%)',
  gold: `linear-gradient(135deg, rgba(239,159,39,0.16) 0%, rgba(217,119,6,0.04) 100%)`,
} as const;

export const radii = {
  card: '16px',
  button: '12px',
  input: '12px',
  pill: '999px',
} as const;

export const shadows = {
  card: '0 1px 0 rgba(255,255,255,0.05) inset, 0 0 0 1px #0F6E56',
  cardHover: '0 0 0 1px #1D9E75, 0 10px 34px rgba(3,18,15,0.5)',
  /** Warm halo under gold CTAs. */
  glow: '0 0 24px rgba(239,159,39,0.45)',
  /** Soft halo around the live game board. */
  canvas: '0 0 60px rgba(15,110,86,0.3)',
} as const;

/** Game board palette (SnakeCanvas reads these — keep in sync with theme). */
export const canvasColors = {
  boardBg: colors.boardBg,
  gridLine: 'rgba(15,110,86,0.2)',
  snakeBody: colors.snake,
  snakeSpot: colors.snakeSpot,
  snakeHead: colors.snakeHead,
  appleBody: colors.berry,
  appleLeaf: colors.berryLeaf,
  appleSeed: colors.berrySeed,
  particleColors: [colors.accentBright, colors.coinLight, colors.coin],

  // Legacy aliases consumed by the current SnakeCanvas until Chunk E rewrites it.
  background: colors.boardBg,
  grid: 'rgba(15,110,86,0.2)',
  snake: colors.snake,
  apple: colors.berry,
} as const;

/** Confetti palette for celebrations: mint + gold + berry per the brand. */
export const confettiColors = [
  colors.accentBright,
  colors.coinLight,
  colors.coin,
  colors.berry,
];
