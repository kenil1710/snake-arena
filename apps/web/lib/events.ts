import { createPublicClient, http, parseAbiItem, type AbiEvent, type Address, type Hex } from 'viem';
import { DEPLOY_BLOCK, LOGS_RPC_URL, SNAKE_ARENA_ADDRESS } from './contracts';

export const ENTERED_TOURNAMENT_EVENT = parseAbiItem(
  'event EnteredTournament(uint256 indexed tournamentId, address indexed player, uint256 entryNumber)',
);
export const SCORE_SUBMITTED_EVENT = parseAbiItem(
  'event ScoreSubmitted(uint256 indexed tournamentId, address indexed player, uint256 score)',
);
export const TOURNAMENT_FINALIZED_EVENT = parseAbiItem(
  'event TournamentFinalized(uint256 indexed tournamentId, address[] winners, uint256[] payouts)',
);

/** The slice of a log the app consumes (and what gets cached). */
export interface ScannedLog<TArgs> {
  args: TArgs;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

export interface FinalizedArgs {
  tournamentId: bigint;
  winners: readonly Address[];
  payouts: readonly bigint[];
}

export interface EnteredArgs {
  tournamentId: bigint;
  player: Address;
  entryNumber: bigint;
}

export interface ScoreArgs {
  tournamentId: bigint;
  player: Address;
  score: bigint;
}

/**
 * Structural slice of a viem public client. wagmi and the app can resolve
 * different viem copies whose nominal PublicClient types don't unify, so the
 * scanner only asks for the methods it calls.
 */
export interface ScanClient {
  getBlockNumber(): Promise<bigint>;
  getBlock(params: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  getLogs(params: {
    address: Address;
    event: AbiEvent;
    args?: Record<string, unknown>;
    strict?: boolean;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<{ args: unknown; blockNumber: bigint; transactionHash: Hex; logIndex: number }[]>;
}

/**
 * eth_getLogs block-range cap. The public Base Sepolia RPC allows a 2000-block
 * range per call; we stay one block under it. (Provider free tiers like Alchemy
 * cap this far lower — 10 blocks — which is why scans run against LOGS_RPC_URL,
 * the range-permissive endpoint, rather than the app's main client.)
 */
const CHUNK_SIZE = 2_000n;
/** One retry after a short pause smooths over a rate-limited RPC's blips. */
const CHUNK_RETRY_DELAY_MS = 1_000;
/** Drop caches this old and rescan from scratch (guards against bad writes). */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = 3;

/**
 * Dedicated client for historical getLogs, pinned to a range-permissive RPC so
 * wide backfills work even when the app's main RPC is a provider key that caps
 * eth_getLogs to a tiny block range. Wallet/contract reads keep using the main
 * (wagmi) client; only these scans use LOGS_RPC_URL.
 */
const scanClient = createPublicClient({ transport: http(LOGS_RPC_URL) });

/** Pull a human-readable reason out of a viem/RPC error for logging. */
function rpcErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { details?: string; shortMessage?: string; message?: string };
    return e.details || e.shortMessage || e.message || String(error);
  }
  return String(error);
}

interface CacheShape<TArgs> {
  version: number;
  savedAt: number;
  /** Highest block already scanned; the next scan resumes after it. */
  scannedTo: bigint;
  logs: ScannedLog<TArgs>[];
}

// JSON can't carry bigints — tag them on the way out, revive on the way in.
function serialize(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    typeof v === 'bigint' ? { $bigint: v.toString() } : v,
  );
}

function deserialize<T>(text: string): T {
  return JSON.parse(text, (_, v: unknown) =>
    v !== null && typeof v === 'object' && '$bigint' in (v as object)
      ? BigInt((v as { $bigint: string }).$bigint)
      : v,
  ) as T;
}

function loadCache<TArgs>(cacheKey: string): CacheShape<TArgs> | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const cache = deserialize<CacheShape<TArgs>>(raw);
    if (cache.version !== CACHE_VERSION) return null;
    if (Date.now() - cache.savedAt > CACHE_MAX_AGE_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

/** Outcome of scanning a block range: the logs plus how far we got cleanly. */
interface RangeScan<TArgs> {
  logs: ScannedLog<TArgs>[];
  /** Highest block reached by an unbroken run of successful chunks. */
  scannedThrough: bigint;
  /** True only when every chunk in [fromBlock, toBlock] succeeded. */
  complete: boolean;
}

async function fetchRange<TArgs>(
  event: AbiEvent,
  args: Record<string, unknown> | undefined,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RangeScan<TArgs>> {
  const common = { address: SNAKE_ARENA_ADDRESS, event, args, strict: true } as const;

  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n > toBlock ? toBlock : start + CHUNK_SIZE - 1n;
    ranges.push({ fromBlock: start, toBlock: end });
  }

  // One chunk with a single retry; null means "gave up on this window" so the
  // overall scan is reported incomplete (rather than throwing the whole thing).
  const fetchChunk = async (range: { fromBlock: bigint; toBlock: bigint }) => {
    try {
      return await scanClient.getLogs({ ...common, ...range });
    } catch (error) {
      console.warn('[events.ts] getLogs failed, retrying:', rpcErrorMessage(error), {
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
        address: SNAKE_ARENA_ADDRESS,
      });
      await new Promise((resolve) => setTimeout(resolve, CHUNK_RETRY_DELAY_MS));
      try {
        return await scanClient.getLogs({ ...common, ...range });
      } catch (retryError) {
        console.warn('[events.ts] getLogs failed after retry:', rpcErrorMessage(retryError), {
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
          address: SNAKE_ARENA_ADDRESS,
        });
        return null;
      }
    }
  };

  // Sequential (range-limited RPCs reject parallel bursts). A skipped chunk
  // marks the scan incomplete but never discards the other chunks' data.
  const out: ScannedLog<TArgs>[] = [];
  let scannedThrough = fromBlock - 1n;
  let complete = true;

  for (const range of ranges) {
    const logs = await fetchChunk(range);
    if (logs === null) {
      complete = false;
      continue; // keep going so partial data still renders
    }
    for (const log of logs) {
      // Historical ranges only return mined logs, but viem's type still allows
      // the pending shape (null block/tx/index) — guard before trusting them.
      if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
        continue;
      }
      out.push({
        args: (log as { args: unknown }).args as TArgs,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      });
    }
    // Advance the "clean" watermark only while no earlier chunk has failed.
    if (complete) scannedThrough = range.toBlock;
  }

  // Concatenated chunks, sorted oldest-first so the merged cache stays ordered.
  out.sort((a, b) => Number(a.blockNumber - b.blockNumber));
  return { logs: out, scannedThrough, complete };
}

/**
 * Incremental, localStorage-cached log scan: the first call backfills from
 * DEPLOY_BLOCK; later calls only fetch blocks mined since the previous scan.
 * Returns `complete: false` when some chunks failed — the caller can surface a
 * "data may be missing" hint, and a refresh resumes from the last clean block.
 */
export async function cachedLogScan<TArgs>(params: {
  event: AbiEvent;
  cacheKey: string;
  args?: Record<string, unknown>;
}): Promise<{ logs: ScannedLog<TArgs>[]; complete: boolean }> {
  const { event, args } = params;
  const cacheKey = `snakearena:logs:v${CACHE_VERSION}:${params.cacheKey}`;

  const cached = loadCache<TArgs>(cacheKey);
  const latest = await scanClient.getBlockNumber();
  const fromBlock = cached ? cached.scannedTo + 1n : DEPLOY_BLOCK;
  const cachedLogs = cached?.logs ?? [];

  if (fromBlock > latest) return { logs: cachedLogs, complete: true };

  const scan = await fetchRange<TArgs>(event, args, fromBlock, latest);

  // Persist only the contiguous, fully-scanned prefix so any gap is retried on
  // the next pass; still return everything fetched (incl. post-gap chunks) so
  // the UI shows as much as it can right now.
  const cacheable = scan.logs.filter((log) => log.blockNumber <= scan.scannedThrough);
  try {
    const cache: CacheShape<TArgs> = {
      version: CACHE_VERSION,
      savedAt: Date.now(),
      scannedTo: scan.scannedThrough,
      logs: [...cachedLogs, ...cacheable],
    };
    localStorage.setItem(cacheKey, serialize(cache));
  } catch {
    // Quota exceeded or storage unavailable — scans just stay non-incremental.
  }

  return { logs: [...cachedLogs, ...scan.logs], complete: scan.complete };
}

const TIMESTAMP_CACHE_KEY = 'snakearena:blocktimes:v1';
const TIMESTAMP_CACHE_MAX = 1_000;

/**
 * Unix timestamps for a set of blocks. Block timestamps are immutable, so
 * resolved values persist in localStorage and never refetch.
 */
export async function blockTimestamps(
  client: ScanClient,
  blockNumbers: Iterable<bigint>,
): Promise<Map<bigint, number>> {
  let cached: Record<string, number> = {};
  try {
    cached = JSON.parse(localStorage.getItem(TIMESTAMP_CACHE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    cached = {};
  }

  const result = new Map<bigint, number>();
  const missing: bigint[] = [];
  for (const blockNumber of new Set(blockNumbers)) {
    const hit = cached[blockNumber.toString()];
    if (hit !== undefined) result.set(blockNumber, hit);
    else missing.push(blockNumber);
  }

  if (missing.length > 0) {
    const blocks = await Promise.all(
      missing.map((blockNumber) => client.getBlock({ blockNumber })),
    );
    missing.forEach((blockNumber, index) => {
      const timestamp = Number(blocks[index].timestamp);
      result.set(blockNumber, timestamp);
      cached[blockNumber.toString()] = timestamp;
    });

    // Keep the cache bounded: oldest blocks age out first.
    const keys = Object.keys(cached);
    if (keys.length > TIMESTAMP_CACHE_MAX) {
      keys
        .sort((a, b) => Number(BigInt(a) - BigInt(b)))
        .slice(0, keys.length - TIMESTAMP_CACHE_MAX)
        .forEach((key) => delete cached[key]);
    }
    try {
      localStorage.setItem(TIMESTAMP_CACHE_KEY, JSON.stringify(cached));
    } catch {
      // Storage unavailable — lookups just stay uncached.
    }
  }

  return result;
}
