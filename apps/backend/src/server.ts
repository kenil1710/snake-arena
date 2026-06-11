import { loadConfig, loadEnvFiles } from './config.js';
import { createApp } from './app.js';
import { createChainClient } from './chain/client.js';
import { createChainVerifier } from './chain/verify.js';
import { createScoreSigner } from './signer/sign.js';
import { SessionManager } from './session/manager.js';
import { log } from './log.js';

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

const app = createApp({ config, sessions, verifier, signer });

app.listen(config.port, () => {
  log(`SnakeArena backend listening on http://localhost:${config.port}`, {
    chainId: config.chainId,
    snakeArena: config.snakeArenaAddress,
    powerUpStore: config.powerUpStoreAddress,
    trustedSigner: signer.address,
  });
});
