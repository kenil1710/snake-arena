'use client';

import { useEffect, useRef } from 'react';
import type { Direction } from '@snake-arena/shared';
import { canvasColors } from '@/lib/design-tokens';
import type { WireGameState } from '@/lib/gameApi';

const CELL = 20;
const COLORS = canvasColors;
const SWIPE_THRESHOLD_PX = 24;
const PARTICLES_PER_APPLE = 14;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 → 0; particle is culled at 0. */
  life: number;
}

interface SnakeCanvasProps {
  state: WireGameState;
  onDirection: (direction: Direction) => void;
}

export function SnakeCanvas({ state, onDirection }: SnakeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const particlesRef = useRef<Particle[]>([]);
  const previousApplesRef = useRef(state.applesEaten);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // New apple eaten → the head now sits where the apple was; burst there.
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
        });
      }
    }
  }

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

      context.fillStyle = COLORS.background;
      context.fillRect(0, 0, logicalSize, logicalSize);

      context.strokeStyle = COLORS.grid;
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
        context.fillStyle = COLORS.apple;
        context.beginPath();
        context.arc(
          current.apple.x * CELL + CELL / 2,
          current.apple.y * CELL + CELL / 2,
          CELL / 2 - 3,
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      current.snake.forEach((segment, index) => {
        context.fillStyle = index === 0 ? COLORS.snakeHead : COLORS.snake;
        context.fillRect(segment.x * CELL + 1, segment.y * CELL + 1, CELL - 2, CELL - 2);
      });

      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= 0.03;
        if (particle.life <= 0) return false;
        context.globalAlpha = particle.life;
        context.fillStyle = COLORS.snake;
        context.fillRect(particle.x - 1.5, particle.y - 1.5, 3, 3);
        return true;
      });
      context.globalAlpha = 1;

      // Death: dim the board under the GameOver overlay.
      if (!current.alive) {
        context.fillStyle = 'rgba(7, 9, 13, 0.72)';
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
      className="aspect-square w-full touch-none rounded-card border border-accent/20 bg-background shadow-canvas"
      style={{ imageRendering: 'pixelated' }}
      aria-label="Snake game board"
    />
  );
}
