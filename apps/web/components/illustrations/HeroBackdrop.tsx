'use client';

/**
 * The lobby hero's atmosphere layer: soft teal/cyan orbs drifting on a slow
 * loop behind the headline. Pre-blurred radial gradients (no CSS filter) so
 * it stays cheap on mobile GPUs; the page-level grid shows through.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="animate-orb absolute -top-[20%] left-[4%] h-[26rem] w-[26rem] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.14) 0%, transparent 62%)' }}
      />
      <div
        className="animate-orb-slow absolute -right-[12%] top-[6%] h-[30rem] w-[30rem] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.13) 0%, transparent 62%)' }}
      />
      <div
        className="animate-orb absolute -bottom-[34%] left-[30%] h-[24rem] w-[24rem] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(45,212,191,0.09) 0%, transparent 65%)',
          animationDelay: '-6s',
        }}
      />
      {/* Blend the band back into the page background. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
