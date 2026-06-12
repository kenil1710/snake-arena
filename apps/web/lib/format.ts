import { formatUnits } from 'viem';

/** 6-decimal USDC units → "$1,234.56". */
export function formatUsdc(value: bigint): string {
  return Number(formatUnits(value, 6)).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTimeLeft(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Ended';
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${minutes}m ${pad(seconds)}s`;
}

/** Card-friendly countdown: "8h 16m" / "16m" / "42s" — no seconds noise above a minute. */
export function formatTimeLeftCompact(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Ended';
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${Math.floor(totalSeconds % 60)}s`;
  return `${totalSeconds}s`;
}

/** Detail-page countdown: "1:23:45" (h:mm:ss) or "23:45" under an hour. */
export function formatTimeLeftClock(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0:00';
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** "just now" / "4 min ago" / "2 h ago" / "3 d ago" from a unix-seconds time. */
export function timeAgo(unixSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (seconds < 60) return 'just now';
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

/** Human-readable message out of a viem/wagmi error. */
export function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'object' && 'shortMessage' in error) {
    return String((error as { shortMessage: unknown }).shortMessage);
  }
  return error instanceof Error ? error.message : String(error);
}
