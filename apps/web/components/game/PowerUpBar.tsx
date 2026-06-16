'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { HeartPulse, Shield, Snail, Zap, type LucideIcon } from 'lucide-react';
import { erc20Abi, parseUnits, type Hex } from 'viem';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import {
  POWER_UP_ENUM_INDEX,
  POWER_UP_PRICES_USDC,
  type PowerUpType,
} from '@snake-arena/shared';
import { toast } from '@/components/Toast';
import { powerUpStoreAbi } from '@/lib/abis/powerUpStore';
import { POWERUP_STORE_ADDRESS, USDC_ADDRESS } from '@/lib/contracts';
import { errorMessage } from '@/lib/format';
import { activatePowerUp, GameApiError, type WireGameState } from '@/lib/gameApi';

/** One approval covers a whole session of purchases (CLAUDE.md session budget). */
const APPROVE_BUDGET = parseUnits('5', 6);

const META: Record<PowerUpType, { Icon: LucideIcon; name: string; color: string }> = {
  shield: { Icon: Shield, name: 'Shield', color: '#9FE1CB' },
  multiplier_2x: { Icon: Zap, name: '2×', color: '#EF9F27' },
  slowmo: { Icon: Snail, name: 'Slow-Mo', color: '#5DCAA5' },
  // Kept so PowerUpType stays exhaustive, but never rendered — the game is one
  // life, one shot. Re-enter from the lobby for another attempt.
  revive: { Icon: HeartPulse, name: 'Revive', color: '#E24B4A' },
};

/** The power-ups actually offered in-game. Revive is intentionally omitted. */
const VISIBLE_POWER_UPS: PowerUpType[] = ['shield', 'multiplier_2x', 'slowmo'];

/** Sub-dollar prices read better as cents on the chunky buttons. */
const formatPrice = (usd: number) => (usd < 1 ? `${Math.round(usd * 100)}¢` : `$${usd.toFixed(2)}`);

type Step = 'approving' | 'buying' | 'activating';

export const STEP_LABEL: Record<Step, string> = {
  approving: 'Approving…',
  buying: 'Confirm in wallet…',
  activating: 'Activating…',
};

/**
 * The approve → buyPowerUp → activate flow behind the in-game power-up bar.
 * The resulting authoritative server state funnels back through `onState`.
 */
export function usePowerUpPurchase(sessionId: Hex, onState: (state: WireGameState) => void) {
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
      toast.error('Power-up purchase failed');
    } finally {
      setPending(null);
    }
  };

  return { buy, pending, failure };
}

interface PowerUpBarProps {
  sessionId: Hex;
  state: WireGameState;
  onState: (state: WireGameState) => void;
}

export function PowerUpBar({ sessionId, state, onState }: PowerUpBarProps) {
  const { buy, pending, failure } = usePowerUpPurchase(sessionId, onState);

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
    return state.alive && !isActive(type);
  };

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-2">
        {VISIBLE_POWER_UPS.map((type) => {
          const { Icon, name, color } = META[type];
          const active = isActive(type);
          const isPending = pending?.type === type;
          return (
            <motion.button
              key={type}
              onClick={() => buy(type)}
              disabled={!isEnabled(type)}
              whileTap={{ scale: 0.96 }}
              style={{ '--pu': color, '--pu-glow': `${color}40` } as React.CSSProperties}
              className={`relative flex h-16 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border bg-surface text-center transition-[border-color,box-shadow] duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'border-coin shadow-[0_0_16px_rgba(239,159,39,0.4)]'
                  : 'border-edge enabled:hover:border-[color:var(--pu)] enabled:hover:shadow-[0_0_16px_var(--pu-glow)]'
              }`}
            >
              <Icon size={18} style={{ color }} aria-hidden />
              <span className="font-display text-xs font-bold leading-none">{name}</span>
              {isPending ? (
                <span className="text-[10px] tabular-nums text-muted">{STEP_LABEL[pending.step]}</span>
              ) : active ? (
                <span className="text-[9px] font-bold uppercase tracking-wider text-coin">Active</span>
              ) : (
                <span className="font-mono text-[11px] font-semibold tabular-nums text-coin">
                  {formatPrice(POWER_UP_PRICES_USDC[type])}
                </span>
              )}
              {active && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 animate-pulse rounded-xl ring-2 ring-coin/50"
                />
              )}
              {isPending && (
                <span
                  aria-hidden
                  className="animate-pending pointer-events-none absolute inset-0 rounded-xl"
                />
              )}
            </motion.button>
          );
        })}
      </div>
      {failure && (
        <p className="mt-2 break-words rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {failure}
        </p>
      )}
    </div>
  );
}
