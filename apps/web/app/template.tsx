'use client';

import { motion } from 'framer-motion';
import { pageFade } from '@/lib/animations';

/** Re-mounts on every route change → soft fade between pages. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={pageFade} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}
