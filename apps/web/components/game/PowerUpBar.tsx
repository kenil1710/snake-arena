'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { erc20Abi, parseUnits, type Hex } from 'viem';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import {
  POWER_UP_ENUM_INDEX,
  POWER_UP_PRICES_USDC,
  POWER_UP_TYPES,
  type PowerUpType,
} from '@snake-arena/shared';
import { powerUpStoreAbi } from '@/lib/abis/powerUpStore';
import { POWERUP_STORE_ADDRESS, USDC_ADDRESS } from '@/lib/contracts';
import { errorMessage } from '@/lib/format';
import { activatePowerUp, GameApiError, type WireGameState } from '@/lib/gameApi';

/** One approval covers a whole session of purchases (CLAUDE.md session budget). */
const APPROVE_BUDGET = parseUnits('5', 6);

const META: Record<PowerUpType, { icon: string; name: string }> = {
  shield: { icon: '🛡', name: 'Shield' },
  multiplier_2x: { icon: '✕2', name: 'Multiplier' },
  slowmo: { icon: '🐌', name: 'Slow-Mo' },
  revive: { icon: '💚', name: 'Revive' },
};

type Step = 'approving' | 'buying' | 'activating';

const STEP_LABEL: Record<Step, string> = {
  approving: 'Approving…',
  buying: 'Confirm in wallet…',
  activating: 'Activating…',
};

interface PowerUpBarProps {
  sessionId: Hex;
  state: WireGameState;
  /** Once the score is on-chain, reviving would be wasted money — lock it. */
  scoreSubmitted: boolean;
  onState: (state: WireGameState) => void;
}

export function PowerUpBar({ sessionId, state, scoreSubmitted, onState }: PowerUpBarProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [pending, setPending] = useState<{ type: PowerUpType; step: Step } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const allowanceRead = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, POWERUP_STORE_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  });

  const isActive = (type: PowerUpType): boolean => {
    switch (type) {
      case 'shield':
        return state.shield;
      case 'multiplier_2x':
        return state.multiplierApplesRemaining > 0;
      case 'slowmo':
        return state.slowMo.active;
      case 'revive':
        return false; // instantaneous — no lingering active state
    }
  };

  const isEnabled = (type: PowerUpType): boolean => {
    if (pending) return false;
    if (type === 'revive') return !state.alive && !scoreSubmitted;
    return state.alive && !isActive(type);
  };

  const buy = async (type: PowerUpType) => {
    if (!publicClient) return;
    setFailure(null);
    const price = parseUnits(POWER_UP_PRICES_USDC[type].toString(), 6);

    try {
      if ((allowanceRead.data ?? 0n) < price) {
        setPending({ type, step: 'approving' });
        const approveTx = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [POWERUP_STORE_ADDRESS, APPROVE_BUDGET],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        await allowanceRead.refetch();
      }

      setPending({ type, step: 'buying' });
      const buyTx = await writeContractAsync({
        address: POWERUP_STORE_ADDRESS,
        abi: powerUpStoreAbi,
        functionName: 'buyPowerUp',
        args: [sessionId, POWER_UP_ENUM_INDEX[type]],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: buyTx });
      if (receipt.status !== 'success') throw new Error('Purchase transaction reverted');
      allowanceRead.refetch();

      setPending({ type, step: 'activating' });
      const { state: nextState } = await activatePowerUp({
        sessionId,
        powerUpType: type,
        txHash: buyTx,
      });
      onState(nextState);
    } catch (error) {
      if (error instanceof GameApiError) {
        if (error.state) onState(error.state);
        setFailure(error.message);
      } else {
        setFailure(errorMessage(error) ?? 'Purchase failed');
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-4">
      <div className="grid grid-cols-4 gap-2">
        {POWER_UP_TYPES.map((type) => {
          const active = isActive(type);
          const isPending = pending?.type === type;
          return (
            <motion.button
              key={type}
              onClick={() => buy(type)}
              disabled={!isEnabled(type)}
              animate={{
                borderColor: active ? '#14b8a6' : '#1a1a1a',
                boxShadow: active ? '0 0 16px rgba(20, 184, 166, 0.35)' : '0 0 0 rgba(0,0,0,0)',
              }}
              className="flex flex-col items-center gap-1 border bg-surface px-1 py-2.5 text-center transition-colors enabled:hover:bg-edge disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-base leading-none" aria-hidden>
                {META[type].icon}
              </span>
              <span className="text-xs font-medium">{META[type].name}</span>
              <span className="text-[11px] tabular-nums text-muted">
                {isPending
                  ? STEP_LABEL[pending.step]
                  : active
                    ? 'Active'
                    : `$${POWER_UP_PRICES_USDC[type].toFixed(2)}`}
              </span>
            </motion.button>
          );
        })}
      </div>
      {failure && (
        <p className="mt-2 break-words border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {failure}
        </p>
      )}
    </div>
  );
}
