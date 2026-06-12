import { loadConfig, loadEnvFiles } from './config.js';
import { createApp } from './app.js';
import { createChainClient } from './chain/client.js';
import { createChainVerifier } from './chain/verify.js';
import { createArenaChain } from './chain/arena.js';
import { createScoreSigner } from './signer/sign.js';
import { SessionManager } from './session/manager.js';
import { TournamentFinalizer } from './cron/tournamentFinalizer.js';
import { createHealthMonitor } from './cron/healthMonitor.js';
import { startCronJobs, type CronJobs } from './cron/cronScheduler.js';
import { createLogger } from './lib/logger.js';

const logger = createLogger('server');

loadEnvFiles();
const config = loadConfig();

const client = createChainClient(config.rpcUrl);
const verifier = createChainVerifier({
  client,
  snakeArenaAddress: config.snakeArenaAddress,
  powerUpStoreAddress: config.powerUpStoreAddress,
});
const signer = createScoreSigner(config.trustedSignerPrivateKey);
const sessions = new SessionManager();
sessions.startCleanup();

let finalizer: TournamentFinalizer | null = null;
let cronJobs: CronJobs | null = null;
if (config.cronEnabled && config.finalizerPrivateKey) {
  const arena = createArenaChain({
    client,
    rpcUrl: config.rpcUrl,
    snakeArenaAddress: config.snakeArenaAddress,
    finalizerPrivateKey: config.finalizerPrivateKey,
  });
  finalizer = new TournamentFinalizer({ chain: arena });
  const healthMonitor = createHealthMonitor({ chain: arena, sessions });
  cronJobs = startCronJobs({ finalizer, healthMonitor });
  logger.info('tournament keeper enabled', { finalizerWallet: arena.finalizerAddress });
} else {
  logger.warn('CRON_ENABLED=false — tournaments will NOT auto-finalize on this instance');
}

const app = createApp({ config, sessions, verifier, signer, finalizer });

const server = app.listen(config.port, () => {
  logger.info(`SnakeArena backend listening on http://localhost:${config.port}`, {
    chainId: config.chainId,
    snakeArena: config.snakeArenaAddress,
    powerUpStore: config.powerUpStoreAddress,
    trustedSigner: signer.address,
    cron: config.cronEnabled,
  });
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  // Stop scheduling new chain txs first; an in-flight finalization still gets
  // its grace window via server.close + the forced-exit timeout below.
  cronJobs?.stop();
  sessions.stopCleanup();
  server.close(() => {
    logger.info('http server closed, bye');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
