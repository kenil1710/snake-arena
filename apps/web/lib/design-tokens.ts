/**
 * SnakeArena design tokens — single source of truth for color, radius, and
 * shadow values. tailwind.config.ts builds the theme from these, and runtime
 * code (canvas, framer-motion, confetti) imports them directly so the two
 * never drift.
 */

export const colors = {
  /** Near-black, slightly blue — more cinematic than flat #0a0a0a. */
  background: '#07090d',
  surface: '#0f1419',
  surfaceElevated: '#161c24',
  /** Deeper than surfaceElevated — game backdrops, gradient anchors. */
  surface3: '#1a2030',
  borderSubtle: '#1f2933',

  /** Energetic teal — primary actions, live accents. */
  teal: '#2dd4bf',
  tealDeep: '#14b8a6',
  tealSoft: '#99f6e4',
  /** Whisper-quiet teal wash for subtle tinted backgrounds. */
  tealDim: 'rgba(45,212,191,0.08)',
  /** Teal at shadow strength — glows under prize numbers and CTAs. */
  tealGlow: 'rgba(45,212,191,0.3)',
  cyan: '#06b6d4',

  gold: '#fbbf24',
  goldDark: '#d97706',
  silver: '#cbd5e1',
  bronze: '#d97706',
  live: '#10b981',
  danger: '#ef4444',
  amber: '#f59e0b',
  usdcBlue: '#2775ca',

  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
} as const;

export const gradients = {
  hero: `linear-gradient(135deg, ${colors.teal} 0%, ${colors.cyan} 100%)`,
  prize: `linear-gradient(180deg, ${colors.teal} 0%, ${colors.tealDeep} 100%)`,
  cardHover: 'radial-gradient(circle at top right, rgba(45,212,191,0.08) 0%, transparent 50%)',
  gold: `linear-gradient(135deg, rgba(251,191,36,0.14) 0%, rgba(217,119,6,0.04) 100%)`,
} as const;

export const radii = {
  card: '16px',
  button: '12px',
  input: '10px',
  pill: '999px',
} as const;

export const shadows = {
  card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 0 0 1px #1f2933',
  cardHover: '0 0 0 1px #2dd4bf, 0 8px 32px rgba(45,212,191,0.12)',
  glow: '0 0 24px rgba(45,212,191,0.4)',
  /** Soft halo around the live game board. */
  canvas: '0 0 60px rgba(45,212,191,0.15)',
} as const;

/** Game board palette (SnakeCanvas reads these — keep in sync with theme). */
export const canvasColors = {
  background: colors.background,
  grid: '#141a21',
  snake: colors.teal,
  snakeHead: colors.tealSoft,
  apple: colors.danger,
} as const;

/** Confetti palette for celebrations: teal + gold per the brand. */
export const confettiColors = [colors.teal, colors.tealSoft, colors.gold, '#ffffff'];
