'use client';

import { useQuery } from '@tanstack/react-query';
import { parseAbiItem } from 'viem';
import { useAccount, usePublicClient, useReadContracts } from 'wagmi';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  DEPLOY_BLOCK,
  EXPLORER_URL,
  SNAKE_ARENA_ADDRESS,
  TOURNAMENT_TIER_IDS,
  TOURNAMENT_TIERS,
} from '@/lib/contracts';
import { formatUsdc, truncateAddress } from '@/lib/format';

const ENTERED_EVENT = parseAbiItem(
  'event EnteredTournament(uint256 indexed tournamentId, address indexed player, uint256 entryNumber)',
);
const SCORE_EVENT = parseAbiItem(
  'event ScoreSubmitted(uint256 indexed tournamentId, address indexed player, uint256 score)',
);

function StatBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border bg-surface px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();

  // Full on-chain history for this wallet, straight from the event logs.
  const history = useQuery({
    queryKey: ['profile-history', address],
    enabled: Boolean(address) && Boolean(client),
    refetchInterval: 15_000,
    queryFn: async () => {
      const common = {
        address: SNAKE_ARENA_ADDRESS,
        args: { player: address },
        fromBlock: DEPLOY_BLOCK,
        toBlock: 'latest',
      } as const;
      const [entered, scores] = await Promise.all([
        client!.getLogs({ ...common, event: ENTERED_EVENT }),
        client!.getLogs({ ...common, event: SCORE_EVENT }),
      ]);
      return { entered, scores };
    },
  });

  const distinctIds = [
    ...new Set((history.data?.entered ?? []).map((log) => log.args.tournamentId!)),
  ];

  // Resolve each tournament's tier + entry fee to price the entries.
  const tournamentReads = useReadContracts({
    contracts: distinctIds.map(
      (id) =>
        ({
          address: SNAKE_ARENA_ADDRESS,
          abi: snakeArenaAbi,
          functionName: 'tournaments',
          args: [id],
        }) as const,
    ),
    query: { enabled: distinctIds.length > 0 },
  });

  const tournamentInfo = new Map<bigint, { tier: number; entryFee: bigint }>();
  distinctIds.forEach((id, index) => {
    const read = tournamentReads.data?.[index];
    if (read?.status === 'success') {
      // tournaments() tuple: [id, tier, startTime, endTime, prizePool, entryFee, finalized]
      const tuple = read.result as readonly [bigint, number, bigint, bigint, bigint, bigint, boolean];
      tournamentInfo.set(id, { tier: tuple[1], entryFee: tuple[5] });
    }
  });

  const tierLabelOf = (tournamentId: bigint | undefined): string => {
    if (tournamentId === undefined) return 'Tournament';
    const info = tournamentInfo.get(tournamentId);
    const tierId = info ? TOURNAMENT_TIER_IDS[info.tier] : undefined;
    return tierId ? TOURNAMENT_TIERS[tierId].label : `Tournament #${tournamentId.toString()}`;
  };

  const totalEntries = history.data?.entered.length;
  const totalSpent = history.data?.entered.reduce(
    (sum, log) => sum + (tournamentInfo.get(log.args.tournamentId!)?.entryFee ?? 0n),
    0n,
  );
  const bestScore = history.data?.scores.reduce(
    (max, log) => ((log.args.score ?? 0n) > max ? log.args.score! : max),
    0n,
  );

  const activity = [
    ...(history.data?.entered.map((log) => ({
      kind: 'entry' as const,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      tournamentId: log.args.tournamentId,
      detail: `Entry #${log.args.entryNumber?.toString() ?? '?'}`,
    })) ?? []),
    ...(history.data?.scores.map((log) => ({
      kind: 'score' as const,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      tournamentId: log.args.tournamentId,
      detail: `Score ${log.args.score?.toString() ?? '?'}`,
    })) ?? []),
  ]
    .sort((a, b) =>
      a.blockNumber === b.blockNumber
        ? b.logIndex - a.logIndex
        : Number(b.blockNumber - a.blockNumber),
    )
    .slice(0, 15);

  if (!isConnected || !address) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted">Connect your wallet to see your tournament history.</p>
        <ConnectWallet className="!rounded-none !bg-accent hover:!bg-accent-hover" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <p className="mt-1 text-sm text-muted">{truncateAddress(address)} on Base Sepolia</p>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatBlock label="Total entries" value={totalEntries ?? '—'} />
        <StatBlock
          label="Total entry spend"
          value={totalSpent === undefined ? '—' : formatUsdc(totalSpent)}
        />
        <StatBlock label="Best score" value={bestScore === undefined ? '—' : bestScore.toString()} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recent activity</h2>
        <div className="mt-3 divide-y divide-edge border bg-surface">
          {history.isLoading && (
            <p className="px-4 py-6 text-center text-sm text-muted">Scanning on-chain history…</p>
          )}
          {history.isError && (
            <p className="px-4 py-6 text-center text-sm text-red-400">
              Could not load events from the RPC. Refresh to retry.
            </p>
          )}
          {history.isSuccess && activity.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">
              No activity yet — enter a tournament from the lobby.
            </p>
          )}
          {activity.map((item) => (
            <div
              key={`${item.txHash}-${item.kind}-${item.logIndex}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block h-1.5 w-1.5 ${item.kind === 'entry' ? 'bg-accent' : 'bg-amber-400'}`}
                  aria-hidden
                />
                <span>
                  {item.kind === 'entry' ? 'Entered' : item.detail + ' in'}{' '}
                  <span className="font-medium">{tierLabelOf(item.tournamentId)}</span>
                  {item.kind === 'entry' && (
                    <span className="text-muted"> · {item.detail}</span>
                  )}
                </span>
              </div>
              <a
                href={`${EXPLORER_URL}/tx/${item.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs text-muted transition-colors hover:text-accent"
              >
                tx ↗
              </a>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
