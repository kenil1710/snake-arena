import { parseAbiItem, type AbiEvent, type Address, type Hex } from 'viem';
import { DEPLOY_BLOCK, SNAKE_ARENA_ADDRESS } from './contracts';

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

/**
 * Structural slice of a viem public client. wagmi and the app can resolve
 * different viem copies whose nominal PublicClient types don't unify, so the
 * scanner only asks for the two methods it calls.
 */
export interface ScanClient {
  getBlockNumber(): Promise<bigint>;
  getLogs(params: {
    address: Address;
    event: AbiEvent;
    args?: Record<string, unknown>;
    strict?: boolean;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<{ args: unknown; blockNumber: bigint; transactionHash: Hex; logIndex: number }[]>;
}

/** Some public RPCs reject wide ranges — retry in fixed-size chunks. */
const CHUNK_SIZE = 10_000n;
/** Drop caches this old and rescan from scratch (guards against bad writes). */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = 1;

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

async function fetchRange<TArgs>(
  client: ScanClient,
  event: AbiEvent,
  args: Record<string, unknown> | undefined,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<ScannedLog<TArgs>[]> {
  const common = { address: SNAKE_ARENA_ADDRESS, event, args, strict: true } as const;

  let logs;
  try {
    logs = await client.getLogs({ ...common, fromBlock, toBlock });
  } catch {
    // Range too wide for this RPC — walk it in chunks.
    logs = [];
    for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
      const end = start + CHUNK_SIZE - 1n > toBlock ? toBlock : start + CHUNK_SIZE - 1n;
      logs.push(...(await client.getLogs({ ...common, fromBlock: start, toBlock: end })));
    }
  }

  return logs.map((log) => ({
    args: log.args as TArgs,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  }));
}

/**
 * Incremental, localStorage-cached log scan: the first call backfills from
 * DEPLOY_BLOCK; later calls only fetch blocks mined since the previous scan.
 */
export async function cachedLogScan<TArgs>(params: {
  client: ScanClient;
  event: AbiEvent;
  cacheKey: string;
  args?: Record<string, unknown>;
}): Promise<ScannedLog<TArgs>[]> {
  const { client, event, args } = params;
  const cacheKey = `snakearena:logs:v${CACHE_VERSION}:${params.cacheKey}`;

  const cached = loadCache<TArgs>(cacheKey);
  const latest = await client.getBlockNumber();
  const fromBlock = cached ? cached.scannedTo + 1n : DEPLOY_BLOCK;

  let logs = cached?.logs ?? [];
  if (fromBlock <= latest) {
    logs = [...logs, ...(await fetchRange<TArgs>(client, event, args, fromBlock, latest))];
  }

  try {
    const cache: CacheShape<TArgs> = { version: CACHE_VERSION, savedAt: Date.now(), scannedTo: latest, logs };
    localStorage.setItem(cacheKey, serialize(cache));
  } catch {
    // Quota exceeded or storage unavailable — scans just stay non-incremental.
  }

  return logs;
}
