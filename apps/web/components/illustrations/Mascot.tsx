'use client';

import { colors } from '@/lib/design-tokens';

/**
 * Sprout, the SnakeArena mascot — one component, four poses:
 *  - hero:  large winding S-curve snake reaching for a strawberry (title screen)
 *  - happy: small coiled snake, round eyes (wins, empty states)
 *  - dead:  small coiled snake, X eyes + lolling tongue (game over — playful)
 *  - mini:  tiny S glyph (header logo / favicon scale)
 *
 * Solid mascot colors (no gradients) per the Night Garden palette. The float /
 * idle animation is applied by the caller via className so reduced-motion is
 * handled once in globals.css.
 */
export type MascotPose = 'hero' | 'happy' | 'dead' | 'mini';

const VIEWBOX: Record<MascotPose, { w: number; h: number }> = {
  hero: { w: 280, h: 210 },
  happy: { w: 64, h: 64 },
  dead: { w: 64, h: 64 },
  mini: { w: 24, h: 24 },
};

const DEFAULT_SIZE: Record<MascotPose, number> = {
  hero: 280,
  happy: 96,
  dead: 96,
  mini: 24,
};

interface MascotProps {
  pose?: MascotPose;
  /** Width in px; height derives from the pose aspect ratio. */
  size?: number;
  className?: string;
  title?: string;
}

export function Mascot({ pose = 'happy', size, className, title }: MascotProps) {
  const vb = VIEWBOX[pose];
  const width = size ?? DEFAULT_SIZE[pose];
  const height = (width * vb.h) / vb.w;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${vb.w} ${vb.h}`}
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {title && <title>{title}</title>}
      {pose === 'hero' && <HeroPose />}
      {pose === 'happy' && <CoilPose mood="happy" />}
      {pose === 'dead' && <CoilPose mood="dead" />}
      {pose === 'mini' && <MiniPose />}
    </svg>
  );
}

/** Big S-curve serpent leaning toward a strawberry. */
function HeroPose() {
  return (
    <>
      {/* Body — single thick stroke, tail (lower-left) to head (upper-right). */}
      <path
        d="M42 182C26 150 64 140 96 144C134 149 142 116 120 98C104 85 128 66 162 74C182 79 196 74 206 80"
        stroke={colors.snake}
        strokeWidth={30}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Belly spots riding the curve. */}
      <ellipse cx="96" cy="144" rx="7" ry="5" fill={colors.snakeSpot} transform="rotate(-8 96 144)" />
      <ellipse cx="122" cy="100" rx="7" ry="5" fill={colors.snakeSpot} transform="rotate(28 122 100)" />
      <ellipse cx="160" cy="76" rx="6.5" ry="5" fill={colors.snakeSpot} transform="rotate(-18 160 76)" />
      {/* Head. */}
      <circle cx="210" cy="80" r="23" fill={colors.snakeHead} />
      <circle cx="212" cy="73" r="3.2" fill={colors.background} />
      <circle cx="221" cy="75" r="3.2" fill={colors.background} />
      {/* Forked tongue flicking toward the berry. */}
      <path
        d="M229 69c6-3 11-6 15-10m-15 12c6-1 12-2 17-3"
        stroke={colors.berry}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* Strawberry. */}
      <g>
        <ellipse cx="250" cy="58" rx="15" ry="17" fill={colors.berry} />
        <ellipse cx="243" cy="43" rx="7.5" ry="4" fill={colors.berryLeaf} transform="rotate(-24 243 43)" />
        <ellipse cx="257" cy="43" rx="7.5" ry="4" fill={colors.berryLeaf} transform="rotate(24 257 43)" />
        <path d="M250 41v-5" stroke={colors.berryLeaf} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="245" cy="55" r="1.7" fill={colors.berrySeed} />
        <circle cx="254" cy="59" r="1.7" fill={colors.berrySeed} />
        <circle cx="249" cy="66" r="1.7" fill={colors.berrySeed} />
      </g>
    </>
  );
}

/** Spiral-coiled snake; mood swaps the eyes + tongue. */
function CoilPose({ mood }: { mood: 'happy' | 'dead' }) {
  return (
    <>
      <path
        d="M32 29a4 4 0 1 1-4 4 8 8 0 1 1 8-8 12 12 0 1 1-12 12 16 16 0 1 1 16-16"
        stroke={colors.snake}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Head cap over the outer end of the coil. */}
      <circle cx="40" cy="19" r="4.6" fill={colors.snakeHead} />
      {mood === 'happy' ? (
        <>
          <circle cx="38" cy="18" r="1.15" fill={colors.background} />
          <circle cx="42" cy="19" r="1.15" fill={colors.background} />
          <path d="M44.6 16.8l2.4-1.5m-2.4 1.5 2.6.8" stroke={colors.berry} strokeWidth="1" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* X eyes — playful, not grim. */}
          <path d="M35.9 16.7l2.4 2.4m0-2.4-2.4 2.4" stroke={colors.background} strokeWidth="1.1" strokeLinecap="round" />
          <path d="M41.1 17l2.4 2.4m0-2.4-2.4 2.4" stroke={colors.background} strokeWidth="1.1" strokeLinecap="round" />
          {/* Tongue lolling out. */}
          <path d="M40 23.5c.6 2.6-.6 4.4-1.8 5.8" stroke={colors.berry} strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
    </>
  );
}

/** Compact S glyph for the header and favicon scale. */
function MiniPose() {
  return (
    <>
      <path
        d="M18 5h-7.5a3.6 3.6 0 0 0 0 7.2h3a3.6 3.6 0 0 1 0 7.2H6"
        stroke={colors.snake}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="17.4" cy="4.4" r="0.95" fill={colors.background} />
      <path d="M18.6 5h2.6" stroke={colors.berry} strokeWidth="0.95" strokeLinecap="round" />
    </>
  );
}
