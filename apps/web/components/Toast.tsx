'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

/**
 * App-wide notifications. Fire with `toast.success / toast.error / toast.info`
 * anywhere in client code; the <Toaster /> in the root layout renders them.
 */
export { toast };

const BASE =
  '!rounded-btn !border !bg-surface-elevated !text-white !shadow-card !border-l-2 !text-sm';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={64}
      gap={8}
      duration={3500}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: `${BASE} !border-edge`,
          success: `${BASE} !border-l-coin`,
          error: `${BASE} !border-l-danger`,
          info: `${BASE} !border-l-accent`,
          description: '!text-secondary',
        },
      }}
    />
  );
}
