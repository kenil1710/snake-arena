'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from '@coinbase/onchainkit/wallet';
import { Address, Avatar, EthBalance, Identity, Name } from '@coinbase/onchainkit/identity';
import { erc20Abi } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { USDC_ADDRESS } from '@/lib/contracts';
import { formatUsdc } from '@/lib/format';

const FAUCET_URL = 'https://faucet.circle.com';

/** Official USDC mark — blue disc, dollar core, orbit ticks. */
function UsdcLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 2000 2000" aria-hidden>
      <circle cx="1000" cy="1000" r="1000" fill="#2775ca" />
      <path
        fill="#fff"
        d="M1275 1158c0-146-88-196-263-217-126-17-151-50-151-109s42-96 126-96c75 0 117 25 138 88 4 12 17 21 29 21h67c17 0 30-13 30-30v-4c-17-92-92-163-188-171v-100c0-17-13-30-34-34h-62c-17 0-30 13-34 34v96c-126 17-205 100-205 204 0 138 84 192 259 213 117 21 155 46 155 113s-59 113-138 113c-109 0-147-46-159-109-4-16-17-25-29-25h-71c-17 0-30 13-30 30v4c17 104 84 179 221 200v101c0 16 13 29 34 33h62c17 0 30-13 34-33v-101c126-21 209-108 209-221z"
      />
      <path
        fill="#fff"
        d="M788 1595c-329-117-497-484-376-808 63-176 201-313 376-376 16-8 25-21 25-42v-58c0-17-9-29-25-33-5 0-13 0-17 4-401 125-621 551-496 951 75 234 255 414 496 489 17 9 33 0 38-16 4-5 4-9 4-17v-59c0-12-13-29-25-35zm441-1313c-17-9-34 0-38 16-4 5-4 9-4 17v59c0 16 12 33 25 37 329 118 497 485 376 809-63 175-201 312-376 375-17 9-25 21-25 42v59c0 16 8 29 25 33 4 0 12 0 17-4 400-125 620-551 495-951-75-238-259-418-495-492z"
      />
    </svg>
  );
}

/** USDC balance pill: official mark + mono amount; tap for the faucet shortcut. */
function UsdcChip() {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!address || balance === undefined) return null;
  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="USDC balance"
        className="glass flex h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium transition-colors hover:border-accent/50"
      >
        <UsdcLogo size={16} />
        <span className="font-mono tabular-nums">{formatUsdc(balance)}</span>
        <span aria-hidden className="h-4 w-px bg-white/10" />
        <svg
          width="8"
          height="5"
          viewBox="0 0 8 5"
          aria-hidden
          className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-48 rounded-btn border bg-surface-elevated p-1 shadow-card">
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-10 items-center rounded-lg px-3 text-sm text-secondary transition-colors hover:bg-surface hover:text-white"
          >
            Get test USDC ↗
          </a>
        </div>
      )}
    </div>
  );
}

export function WalletWidget() {
  const { status } = useAccount();
  const connecting = status === 'connecting' || status === 'reconnecting';

  return (
    <div className="flex items-center gap-2">
      <UsdcChip />
      <div className="relative">
        {connecting && (
          <span
            aria-hidden
            className="absolute -inset-0.5 animate-spin rounded-full border border-transparent border-t-accent"
          />
        )}
        <Wallet>
          <ConnectWallet className="!h-9 !min-w-0 !rounded-full !bg-accent !px-4 !py-0 !text-sm !font-semibold !text-background !shadow-glow hover:!bg-accent-hover">
            <Avatar className="h-5 w-5" />
            <Name className="text-sm !text-background" />
          </ConnectWallet>
          <WalletDropdown className="!rounded-card !border !border-edge !bg-surface-elevated">
            <Identity className="px-4 pb-2 pt-3" hasCopyAddressOnClick>
              <Avatar />
              <Name />
              <Address />
              <EthBalance />
            </Identity>
            <WalletDropdownDisconnect className="hover:!bg-surface" />
          </WalletDropdown>
        </Wallet>
      </div>
    </div>
  );
}
