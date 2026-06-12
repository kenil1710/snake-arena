import type { Variants, Transition } from 'framer-motion';

/** Default spring for UI elements — snappy without overshoot wobble. */
export const springFast: Transition = { type: 'spring', stiffness: 420, damping: 32 };

/** Parent wrapper that staggers its children in (50ms apart). */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

/** Child of staggerContainer: fade up into place. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.21, 0.65, 0.35, 1] } },
};

/** Feed items entering from the left (live winners). */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

/** Spread onto any motion button: brief scale-down tap feedback. */
export const press = {
  whileTap: { scale: 0.97 },
  transition: springFast,
} as const;

/** Softer press for full cards. */
export const cardPress = {
  whileTap: { scale: 0.99 },
  transition: springFast,
} as const;

/** Bottom sheet slide-up (mobile modals). */
export const sheetUp: Variants = {
  hidden: { opacity: 0, y: 48 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.21, 0.65, 0.35, 1] } },
  exit: { opacity: 0, y: 48, transition: { duration: 0.2, ease: 'easeIn' } },
};

/** Route-level fade used by the page transition template. */
export const pageFade: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};
