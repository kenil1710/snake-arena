'use client';

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

/** Live USDC balance chip shown next to the wallet button. */
function UsdcChip() {
  const { address } = useAccount();
  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });

  if (!address || balance === undefined) return null;
  return (
    <span className="hidden border bg-surface px-2.5 py-1.5 text-xs font-medium tabular-nums text-muted sm:inline-block">
      {formatUsdc(balance)} <span className="text-accent">USDC</span>
    </span>
  );
}

export function WalletWidget() {
  return (
    <div className="flex items-center gap-2">
      <UsdcChip />
      <Wallet>
        <ConnectWallet className="!rounded-none !bg-accent !px-3 !py-1.5 text-sm font-medium !text-background hover:!bg-accent-hover">
          <Avatar className="h-5 w-5" />
          <Name className="text-sm !text-background" />
        </ConnectWallet>
        <WalletDropdown className="!rounded-none border bg-surface">
          <Identity className="px-4 pb-2 pt-3" hasCopyAddressOnClick>
            <Avatar />
            <Name />
            <Address />
            <EthBalance />
          </Identity>
          <WalletDropdownDisconnect className="hover:!bg-edge" />
        </WalletDropdown>
      </Wallet>
    </div>
  );
}
