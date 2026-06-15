import type { Config } from 'tailwindcss';
import { colors, radii, shadows } from './lib/design-tokens';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: colors.background,
        board: colors.boardBg,
        surface: {
          DEFAULT: colors.surface,
          elevated: colors.surfaceRaised,
          raised: colors.surfaceRaised,
          deep: colors.boardBg,
        },
        edge: {
          DEFAULT: colors.border,
          bright: colors.borderBright,
        },
        muted: colors.textMuted,
        secondary: colors.textSecondary,
        accent: {
          DEFAULT: colors.accent,
          hover: colors.accentBright,
          soft: colors.accentBright,
          bright: colors.accentBright,
        },
        coin: {
          DEFAULT: colors.coin,
          light: colors.coinLight,
          text: colors.coinText,
        },
        snake: {
          DEFAULT: colors.snake,
          spot: colors.snakeSpot,
          head: colors.snakeHead,
        },
        leaf: {
          DEFAULT: colors.leaf,
          dark: colors.leafDark,
        },
        berry: {
          DEFAULT: colors.berry,
          leaf: colors.berryLeaf,
          seed: colors.berrySeed,
        },
        cyan: colors.cyan,
        gold: {
          DEFAULT: colors.gold,
          dark: colors.goldDark,
        },
        silver: colors.silver,
        bronze: colors.bronze,
        live: colors.live,
        danger: colors.danger,
        usdc: colors.usdcBlue,
      },
      borderColor: {
        // Plain `border` class gets the design-system hairline by default.
        DEFAULT: colors.border,
      },
      borderRadius: {
        card: radii.card,
        btn: radii.button,
        input: radii.input,
      },
      boxShadow: {
        card: shadows.card,
        'card-hover': shadows.cardHover,
        glow: shadows.glow,
        canvas: shadows.canvas,
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-baloo)', 'var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
