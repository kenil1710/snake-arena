import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { isAddress, getAddress, type Address, type Hex } from 'viem';

export interface BackendConfig {
  port: number;
  chainId: number;
  rpcUrl: string;
  snakeArenaAddress: Address;
  powerUpStoreAddress: Address;
  usdcAddress: Address | null;
  trustedSignerPrivateKey: Hex;
  corsOrigins: string[];
}

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // apps/backend

/**
 * Loads env files into process.env. Deploy secrets and contract addresses live in
 * the monorepo root .env; an apps/backend/.env can override locally.
 */
export function loadEnvFiles(): void {
  loadDotenv({
    path: [path.resolve(backendRoot, '.env'), path.resolve(backendRoot, '../../.env')],
  });
}

function requireVar(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireAddress(env: NodeJS.ProcessEnv, name: string): Address {
  const value = requireVar(env, name);
  if (!isAddress(value)) throw new Error(`Environment variable ${name} is not a valid address: ${value}`);
  return getAddress(value);
}

/** Builds the runtime config from the environment. Throws on missing/invalid values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const privateKey = requireVar(env, 'TRUSTED_SIGNER_PRIVATE_KEY');
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('TRUSTED_SIGNER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string');
  }

  const usdc = env.USDC_BASE_SEPOLIA;
  return {
    port: Number(env.PORT ?? 3001),
    chainId: Number(env.CHAIN_ID_SEPOLIA ?? 84532),
    rpcUrl: env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org',
    snakeArenaAddress: requireAddress(env, 'SNAKE_ARENA_ADDRESS'),
    powerUpStoreAddress: requireAddress(env, 'POWERUP_STORE_ADDRESS'),
    usdcAddress: usdc && isAddress(usdc) ? getAddress(usdc) : null,
    trustedSignerPrivateKey: privateKey as Hex,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
  };
}
