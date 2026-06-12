import type { Config } from 'tailwindcss';
import { colors, radii, shadows } from './lib/design-tokens';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: colors.background,
        surface: {
          DEFAULT: colors.surface,
          elevated: colors.surfaceElevated,
          deep: colors.surface3,
        },
        edge: colors.borderSubtle,
        muted: colors.textMuted,
        secondary: colors.textSecondary,
        accent: {
          DEFAULT: colors.teal,
          hover: colors.tealDeep,
          soft: colors.tealSoft,
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
        DEFAULT: colors.borderSubtle,
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
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
