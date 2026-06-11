import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#111111',
        edge: '#1a1a1a',
        muted: '#888888',
        accent: {
          DEFAULT: '#14b8a6',
          hover: '#0d9488',
        },
      },
      borderColor: {
        // Plain `border` class gets the design-system hairline by default.
        DEFAULT: '#1a1a1a',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
