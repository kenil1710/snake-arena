'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { erc20Abi } from 'viem';
import {
  useAccount,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  SNAKE_ARENA_ADDRESS,
  TIER_ENUM_INDEX,
  TOURNAMENT_TIERS,
  USDC_ADDRESS,
  type ActiveTournament,
  type TournamentTierId,
} from '@/lib/contracts';
import { errorMessage, formatUsdc } from '@/lib/format';
import { TARGET_CHAIN_ID, TARGET_CHAIN_NAME } from '@/lib/wagmi';
import { toast } from './Toast';
import { Modal } from './ui/Modal';
import { TierIcon } from './illustrations/TierIcon';

const USERNAME_PATTERN = /^[a-zA-Z0-9]{1,20}$/;
const FAUCET_URL = 'https://faucet.circle.com';

type Step = 'connect' | 'loading' | 'balance' | 'approve' | 'username' | 'confirm' | 'success';

interface EntryFlowProps {
  tierId: TournamentTierId;
  tournament: ActiveTournament;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn-sheen font-display mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-coin-text shadow-glow transition-[box-shadow] hover:shadow-[0_0_28px_rgba(239,159,39,0.5)] disabled:cursor-not-allowed disabled:bg-edge disabled:bg-none disabled:text-muted disabled:shadow-none"
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-coin-text border-t-transparent"
    />
  );
}

export function EntryFlow({ tierId, tournament, onClose }: EntryFlowProps) {
  const router = useRouter();
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const config = TOURNAMENT_TIERS[tierId];
  const fee = tournament.entryFee;

  const [usernameInput, setUsernameInput] = useState('');
  const [usernameConfirmed, setUsernameConfirmed] = useState(false);
  const [switchRejected, setSwitchRejected] = useState(false);
  const [navStuck, setNavStuck] = useState(false);

  const { switchChainAsync, isPending: switching } = useSwitchChain();

  /**
   * A wallet on the wrong chain mis-simulates our calldata (phantom "deposit
   * more ETH" / fraud warnings), so every tx is gated on a completed switch.
   */
  const withCorrectChain = async (sendTransaction: () => void) => {
    if (walletChainId !== TARGET_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: TARGET_CHAIN_ID });
      } catch {
        setSwitchRejected(true);
        return;
      }
    }
    setSwitchRejected(false);
    sendTransaction();
  };

  const reads = useReadContracts({
    contracts: address
      ? ([
          { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
          {
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, SNAKE_ARENA_ADDRESS],
          },
          { address: SNAKE_ARENA_ADDRESS, abi: snakeArenaAbi, functionName: 'usernames', args: [address] },
        ] as const)
      : [],
    query: { enabled: Boolean(address) },
  });

  const balance = reads.data?.[0]?.status === 'success' ? (reads.data[0].result as bigint) : undefined;
  const allowance = reads.data?.[1]?.status === 'success' ? (reads.data[1].result as bigint) : undefined;
  const onchainUsername = reads.data?.[2]?.status === 'success' ? (reads.data[2].result as string) : undefined;

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const enter = useWriteContract();
  const enterReceipt = useWaitForTransactionReceipt({ hash: enter.data });

  // Allowance changed on-chain once the approval confirms — re-read it.
  useEffect(() => {
    if (approveReceipt.isSuccess) reads.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt.isSuccess]);

  // Entry confirmed → go straight to the game. Stash a lastEntry fallback (so
  // the play page can recover the tx if the query param is lost), toast, wait
  // 500ms for state to settle, then navigate. If we're somehow still mounted a
  // few seconds later the push didn't take, so expose a manual "Start game now"
  // button rather than leaving the player stranded with a paid entry.
  useEffect(() => {
    if (!enterReceipt.isSuccess || !enter.data) return;
    const id = tournament.id.toString();
    const entryTx = enter.data;
    const target = `/play/${id}?entryTx=${entryTx}`;
    try {
      sessionStorage.setItem(
        'lastEntry',
        JSON.stringify({ tournamentId: id, txHash: entryTx, timestamp: Date.now() }),
      );
    } catch {
      // Storage unavailable (private mode) — the query param still carries it.
    }
    toast.success(`Entered ${formatUsdc(fee)} — let's play 🐍`);
    const go = setTimeout(() => router.push(target), 500);
    const watchdog = setTimeout(() => setNavStuck(true), 3000);
    return () => {
      clearTimeout(go);
      clearTimeout(watchdog);
    };
  }, [enterReceipt.isSuccess, enter.data, router, tournament.id, fee]);

  const approving = approve.isPending || (Boolean(approve.data) && approveReceipt.isLoading);
  const entering = enter.isPending || (Boolean(enter.data) && enterReceipt.isLoading);
  const needsUsername = (onchainUsername ?? '') === '' && !usernameConfirmed;

  let step: Step;
  if (!isConnected || !address) step = 'connect';
  else if (balance === undefined || allowance === undefined || onchainUsername === undefined)
    step = 'loading';
  else if (enterReceipt.isSuccess) step = 'success';
  else if (balance < fee) step = 'balance';
  else if (allowance < fee) step = 'approve';
  else if (needsUsername) step = 'username';
  else step = 'confirm';

  const failure = errorMessage(approve.error ?? enter.error);

  return (
    <Modal title={`Enter ${config.label}`} onClose={onClose}>
      <div className="space-y-2 rounded-btn border bg-background p-4">
        <Row
          label="Tournament"
          value={
            <span className="flex items-center gap-1.5">
              <TierIcon tierId={tierId} size={16} className="shrink-0" />
              {config.label} #{tournament.id.toString()}
            </span>
          }
        />
        <Row label="Entry fee" value={formatUsdc(fee)} />
        <Row
          label="Current prize pool"
          value={
            <span className="font-mono font-semibold text-accent">
              {formatUsdc(tournament.prizePool)}
            </span>
          }
        />
      </div>

      {(failure || switchRejected) && step !== 'success' && (
        <p className="mt-4 break-words rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {switchRejected ? `Please switch to ${TARGET_CHAIN_NAME} to play.` : failure}
        </p>
      )}

      {step === 'connect' && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <p className="text-sm text-secondary">Connect your Coinbase Smart Wallet to enter.</p>
          <ConnectWallet className="!rounded-full !bg-accent hover:!bg-accent-hover" />
        </div>
      )}

      {step === 'loading' && (
        <div className="mt-5 flex items-center justify-center gap-2.5 text-sm text-muted">
          <span
            aria-hidden
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />
          Checking your wallet…
        </div>
      )}

      {step === 'balance' && (
        <div className="mt-5">
          <p className="text-sm">
            You need {formatUsdc(fee)} USDC but only have{' '}
            <span className="tabular-nums">{formatUsdc(balance ?? 0n)}</span>.
          </p>
          <p className="mt-2 text-sm text-muted">
            Grab free test USDC for Base Sepolia at{' '}
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              faucet.circle.com
            </a>
            .
          </p>
          <PrimaryButton onClick={() => reads.refetch()}>I topped up — check again</PrimaryButton>
        </div>
      )}

      {step === 'approve' && (
        <div className="mt-5">
          <p className="text-sm text-muted">
            Step 1 of 2 — approve {formatUsdc(fee)} USDC so SnakeArena can collect your entry fee.
          </p>
          <PrimaryButton
            disabled={approving || switching}
            onClick={() =>
              withCorrectChain(() =>
                approve.writeContract({
                  address: USDC_ADDRESS,
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [SNAKE_ARENA_ADDRESS, fee],
                }),
              )
            }
          >
            {switching ? (
              <>
                <Spinner /> Switching to {TARGET_CHAIN_NAME}…
              </>
            ) : approving ? (
              <>
                <Spinner /> {approve.isPending ? 'Confirm in wallet…' : 'Waiting for confirmation…'}
              </>
            ) : (
              `Approve ${formatUsdc(fee)} USDC`
            )}
          </PrimaryButton>
        </div>
      )}

      {step === 'username' && (
        <div className="mt-5">
          <label htmlFor="username" className="text-sm text-muted">
            Pick a username — it is bound to your wallet on your first entry.
          </label>
          <input
            id="username"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            placeholder="snakecharmer42"
            maxLength={20}
            autoFocus
            className="mt-2 min-h-12 w-full rounded-input border bg-background px-3.5 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <p className="mt-1.5 text-xs text-muted">1–20 characters, letters and numbers only.</p>
          <PrimaryButton
            disabled={!USERNAME_PATTERN.test(usernameInput)}
            onClick={() => setUsernameConfirmed(true)}
          >
            Continue
          </PrimaryButton>
        </div>
      )}

      {step === 'confirm' && (
        <div className="mt-5">
          <p className="text-sm text-muted">
            {onchainUsername
              ? `Playing as ${onchainUsername}.`
              : `Playing as ${usernameInput} (set on this entry).`}{' '}
            Each entry is one game attempt — only your best score counts.
          </p>
          <PrimaryButton
            disabled={entering || switching}
            onClick={() =>
              withCorrectChain(() =>
                enter.writeContract({
                  address: SNAKE_ARENA_ADDRESS,
                  abi: snakeArenaAbi,
                  functionName: 'enterTournament',
                  args: [TIER_ENUM_INDEX[tierId], onchainUsername ? '' : usernameInput],
                }),
              )
            }
          >
            {switching ? (
              <>
                <Spinner /> Switching to {TARGET_CHAIN_NAME}…
              </>
            ) : entering ? (
              <>
                <Spinner /> {enter.isPending ? 'Confirm in wallet…' : 'Entering tournament…'}
              </>
            ) : (
              `Enter for ${formatUsdc(fee)}`
            )}
          </PrimaryButton>
        </div>
      )}

      {step === 'success' && (
        <div className="mt-5 flex flex-col items-center text-center">
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-accent/15 text-xl text-accent shadow-glow"
            aria-hidden
          >
            ✓
          </motion.span>
          <p className="mt-3 text-sm font-bold">Entry confirmed</p>
          {navStuck ? (
            <>
              <p className="mt-1 text-sm text-secondary">Almost there — tap to start.</p>
              <button
                onClick={() => router.push(`/play/${tournament.id}?entryTx=${enter.data}`)}
                className="btn-sheen font-display mt-3 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full text-sm font-bold text-coin-text shadow-glow transition-shadow hover:shadow-[0_0_28px_rgba(239,159,39,0.5)]"
              >
                <span aria-hidden>▶</span> Start game now
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-secondary">Taking you to the game…</p>
          )}
        </div>
      )}
    </Modal>
  );
}
