/**
 * Minimal Web Audio blips — no assets. The context is created lazily on first
 * play because browsers only allow audio after a user gesture.
 */
let ctx: AudioContext | null = null;

function tone(
  frequency: number,
  durationMs: number,
  type: OscillatorType,
  gain: number,
  whenOffset = 0,
): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime + whenOffset;
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(gain, start);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
    oscillator.connect(volume).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + durationMs / 1000);
  } catch {
    // Audio unavailable — the game plays fine silent.
  }
}

/** Eating an apple: a short, bright pluck. */
export function playAppleSound(): void {
  tone(1174.7, 80, 'triangle', 0.05); // ~D6
}

/** Death: a low, descending two-tone. */
export function playDeathSound(): void {
  tone(220, 170, 'sawtooth', 0.06); // A3
  tone(146.83, 300, 'sawtooth', 0.055, 0.13); // → D3
}
