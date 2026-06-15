'use client';

import { colors } from '@/lib/design-tokens';

/**
 * A leafy mound built from overlapping circles. Tucked into page corners as
 * garden scenery — `back` (darker) layers behind `front` (lighter) for depth.
 * Callers set opacity/position; this just draws the shape.
 */
export function Bush({
  size = 120,
  variant = 'front',
  className,
}: {
  size?: number;
  variant?: 'front' | 'back';
  className?: string;
}) {
  const fill = variant === 'back' ? colors.leafDark : colors.leaf;
  const height = (size * 70) / 120;
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 120 70"
      fill={fill}
      aria-hidden
      className={className}
    >
      <circle cx="22" cy="48" r="22" />
      <circle cx="50" cy="36" r="30" />
      <circle cx="82" cy="42" r="26" />
      <circle cx="104" cy="52" r="18" />
      <circle cx="66" cy="54" r="20" />
      {/* Flat-ish base so the cluster sits on the ground. */}
      <rect x="6" y="52" width="108" height="18" rx="8" />
    </svg>
  );
}
