'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { erc20Abi } from 'viem';
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  SNAKE_ARENA_ADDRESS,
  TIER_ENUM_INDEX,
  TIER_META,
  TOURNAMENT_TIERS,
  USDC_ADDRESS,
  type ActiveTournament,
  type TournamentTierId,
} from '@/lib/contracts';
import { errorMessage, formatUsdc } from '@/lib/format';
import { Modal } from './ui/Modal';

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
      className="mt-5 w-full bg-accent py-2.5 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-edge disabled:text-muted"
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin border-2 border-background border-t-transparent align-[-2px]"
    />
  );
}

export function EntryFlow({ tierId, tournament, onClose }: EntryFlowProps) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const config = TOURNAMENT_TIERS[tierId];
  const fee = tournament.entryFee;

  const [usernameInput, setUsernameInput] = useState('');
  const [usernameConfirmed, setUsernameConfirmed] = useState(false);

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

  // Entry confirmed — hand off to the play page (placeholder until Phase 5).
  useEffect(() => {
    if (!enterReceipt.isSuccess) return;
    const timer = setTimeout(() => router.push(`/play/${tournament.id.toString()}`), 900);
    return () => clearTimeout(timer);
  }, [enterReceipt.isSuccess, router, tournament.id]);

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
      <div className="space-y-1.5 border bg-background p-4">
        <Row label="Tournament" value={`${TIER_META[tierId].icon} ${config.label} #${tournament.id.toString()}`} />
        <Row label="Entry fee" value={formatUsdc(fee)} />
        <Row label="Current prize pool" value={<span className="text-accent">{formatUsdc(tournament.prizePool)}</span>} />
      </div>

      {failure && step !== 'success' && (
        <p className="mt-4 break-words border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {failure}
        </p>
      )}

      {step === 'connect' && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <p className="text-sm text-muted">Connect your Coinbase Smart Wallet to enter.</p>
          <ConnectWallet className="!rounded-none !bg-accent hover:!bg-accent-hover" />
        </div>
      )}

      {step === 'loading' && <p className="mt-5 text-center text-sm text-muted">Checking your wallet…</p>}

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
            disabled={approving}
            onClick={() =>
              approve.writeContract({
                address: USDC_ADDRESS,
                abi: erc20Abi,
                functionName: 'approve',
                args: [SNAKE_ARENA_ADDRESS, fee],
              })
            }
          >
            {approving ? (
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
            className="mt-2 w-full border bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/50 focus:border-accent"
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
            disabled={entering}
            onClick={() =>
              enter.writeContract({
                address: SNAKE_ARENA_ADDRESS,
                abi: snakeArenaAbi,
                functionName: 'enterTournament',
                args: [TIER_ENUM_INDEX[tierId], onchainUsername ? '' : usernameInput],
              })
            }
          >
            {entering ? (
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
        <div className="mt-5 text-center">
          <p className="text-2xl text-accent">✓</p>
          <p className="mt-2 text-sm font-medium">Entry confirmed</p>
          <p className="mt-1 text-sm text-muted">Taking you to the game…</p>
        </div>
      )}
    </Modal>
  );
}
