/**
 * Minimal Web Audio blips — no assets. The context is created lazily on first
 * play because browsers only allow audio after a user gesture.
 */
let ctx: AudioContext | null = null;

function play(frequency: number, durationMs: number, type: OscillatorType, gain: number): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();

    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, ctx.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    oscillator.connect(volume).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Audio unavailable — the game plays fine silent.
  }
}

export function playAppleSound(): void {
  play(880, 90, 'square', 0.04);
}

export function playDeathSound(): void {
  play(140, 450, 'sawtooth', 0.06);
}
