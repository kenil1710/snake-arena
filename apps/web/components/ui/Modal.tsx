'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { sheetUp } from '@/lib/animations';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Bottom sheet on mobile (slides up, drag-handle look), centered dialog on sm+. */
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the sheet is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        variants={sheetUp}
        initial="hidden"
        animate="show"
        className="w-full max-w-md rounded-t-card border bg-surface pb-[max(env(safe-area-inset-bottom),0px)] shadow-card sm:rounded-card"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Drag-handle affordance (mobile sheet idiom) */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-edge" />
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-display text-sm font-bold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-btn text-muted transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="border-t px-5 py-5">{children}</div>
      </motion.div>
    </div>
  );
}
