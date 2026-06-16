'use client';

import { useEffect, useRef, useState } from 'react';
import type { Direction } from '@snake-arena/shared';
import { canvasColors } from '@/lib/design-tokens';
import type { WireGameState } from '@/lib/gameApi';

const CELL = 20;
const C = canvasColors;
const SWIPE_THRESHOLD_PX = 24;
const PARTICLES_PER_APPLE = 16;
const DEATH_FLASH_MS = 160;

const DIR_VECTOR: Record<Direction, { x: number; y: number }> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 → 0; particle is culled at 0. */
  life: number;
  color: string;
}

interface SnakeCanvasProps {
  state: WireGameState;
  onDirection: (direction: Direction) => void;
}

/** Rounded-rect path helper (arcTo for webview compatibility). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A strawberry drawn cell-centered: red body, two leaves, three seeds. */
function drawStrawberry(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const r = CELL / 2 - 2;
  ctx.fillStyle = C.appleBody;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, r, r + 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.appleLeaf;
  ctx.beginPath();
  ctx.ellipse(cx - 2.6, cy - r + 1.5, 3.2, 1.7, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 2.6, cy - r + 1.5, 3.2, 1.7, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.appleSeed;
  for (const [sx, sy] of [
    [-2.4, 0],
    [2.4, 1.6],
    [0, 4],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + sx, cy + sy, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Snake head: rounded, slightly larger, with two eyes + a tongue facing `dir`. */
function drawHead(
  ctx: CanvasRenderingContext2D,
  segX: number,
  segY: number,
  dir: Direction,
  flash: boolean,
) {
  const x = segX * CELL;
  const y = segY * CELL;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  ctx.fillStyle = flash ? C.appleBody : C.snakeHead;
  roundRectPath(ctx, x + 0.5, y + 0.5, CELL - 1, CELL - 1, 6);
  ctx.fill();

  const v = DIR_VECTOR[dir];
  const px = -v.y;
  const py = v.x;
  const fwd = CELL * 0.16;
  const side = CELL * 0.24;
  ctx.fillStyle = '#04241f';
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.arc(cx + v.x * fwd + px * side * s, cy + v.y * fwd + py * side * s, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Forked tongue flicking in the direction of travel.
  ctx.strokeStyle = C.appleBody;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  const tx = cx + v.x * (CELL / 2);
  const ty = cy + v.y * (CELL / 2);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx + v.x * 4, ty + v.y * 4);
  ctx.stroke();
}

export function SnakeCanvas({ state, onDirection }: SnakeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const particlesRef = useRef<Particle[]>([]);
  const previousApplesRef = useRef(state.applesEaten);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const deathFlashUntilRef = useRef(0);
  const [shaking, setShaking] = useState(false);

  // New apple eaten → head sits where the apple was; burst mint + gold there.
  stateRef.current = state;
  if (state.applesEaten > previousApplesRef.current) {
    previousApplesRef.current = state.applesEaten;
    const head = state.snake[0];
    if (head) {
      const cx = head.x * CELL + CELL / 2;
      const cy = head.y * CELL + CELL / 2;
      for (let i = 0; i < PARTICLES_PER_APPLE; i++) {
        const angle = (Math.PI * 2 * i) / PARTICLES_PER_APPLE + Math.random() * 0.5;
        const speed = 0.6 + Math.random() * 1.6;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color: C.particleColors[i % C.particleColors.length],
        });
      }
    }
  }

  // Death feedback: a brief red head flash + a board shake (reduced-motion safe).
  useEffect(() => {
    if (state.alive) return;
    deathFlashUntilRef.current = performance.now() + DEATH_FLASH_MS;
    setShaking(true);
    const timer = setTimeout(() => setShaking(false), DEATH_FLASH_MS);
    return () => clearTimeout(timer);
  }, [state.alive]);

  // Render loop: rAF redraws latest server state + decaying particles.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const { width: gridWidth, height: gridHeight } = stateRef.current.grid;
    const logicalSize = gridWidth * CELL; // 400 for the 20x20 grid
    const dpr = window.devicePixelRatio || 1;
    canvas.width = logicalSize * dpr;
    canvas.height = gridHeight * CELL * dpr;
    context.scale(dpr, dpr);

    let frame: number;
    const draw = () => {
      const current = stateRef.current;

      context.fillStyle = C.boardBg;
      context.fillRect(0, 0, logicalSize, logicalSize);

      context.strokeStyle = C.gridLine;
      context.lineWidth = 1;
      context.beginPath();
      for (let i = 0; i <= gridWidth; i++) {
        context.moveTo(i * CELL + 0.5, 0);
        context.lineTo(i * CELL + 0.5, logicalSize);
        context.moveTo(0, i * CELL + 0.5);
        context.lineTo(logicalSize, i * CELL + 0.5);
      }
      context.stroke();

      if (current.apple) {
        drawStrawberry(
          context,
          current.apple.x * CELL + CELL / 2,
          current.apple.y * CELL + CELL / 2,
        );
      }

      const flash = !current.alive && performance.now() < deathFlashUntilRef.current;
      current.snake.forEach((segment, index) => {
        if (index === 0) {
          drawHead(context, segment.x, segment.y, current.direction, flash);
          return;
        }
        context.fillStyle = C.snakeBody;
        roundRectPath(context, segment.x * CELL + 1, segment.y * CELL + 1, CELL - 2, CELL - 2, 5);
        context.fill();
        // A belly spot every few segments.
        if (index % 3 === 0) {
          context.fillStyle = C.snakeSpot;
          context.beginPath();
          context.arc(segment.x * CELL + CELL / 2, segment.y * CELL + CELL / 2, 2.4, 0, Math.PI * 2);
          context.fill();
        }
      });

      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 0.03;
        if (particle.life <= 0) return false;
        context.globalAlpha = particle.life;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, 1.8, 0, Math.PI * 2);
        context.fill();
        return true;
      });
      context.globalAlpha = 1;

      // Death: dim the board under the GameOver overlay.
      if (!current.alive) {
        context.fillStyle = 'rgba(4, 36, 31, 0.6)';
        context.fillRect(0, 0, logicalSize, logicalSize);
      }

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keyboard steering (desktop).
  useEffect(() => {
    const keyMap: Record<string, Direction> = {
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
      w: 'UP',
      s: 'DOWN',
      a: 'LEFT',
      d: 'RIGHT',
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keyMap[event.key] ?? keyMap[event.key.toLowerCase()];
      if (!direction) return;
      event.preventDefault(); // arrows would scroll the page
      onDirection(direction);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDirection]);

  // Swipe steering (mobile).
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) onDirection(dx > 0 ? 'RIGHT' : 'LEFT');
    else onDirection(dy > 0 ? 'DOWN' : 'UP');
  };

  return (
    <canvas
      ref={canvasRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={`aspect-square w-full touch-none rounded-card border-[3px] border-edge bg-board shadow-canvas ${
        shaking ? 'animate-shake' : ''
      }`}
      aria-label="Snake game board"
    />
  );
}
