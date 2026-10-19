import { createApp } from './app.js';
import { config } from '../config.js';
import { logger } from '../log.js';
import { disconnectDb } from '../db.js';
import { warnIfSignInUnconfigured } from './auth.js';

const c = config();
warnIfSignInUnconfigured();
const app = createApp();
const server = app.listen(c.API_PORT, () => {
  logger.info({ port: c.API_PORT, chainId: c.CHAIN_ID, mode: c.verificationMode, gsera: c.GSERA_MODE, settlement: c.settlementMode }, 'api listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'api shutting down');
  server.close();
  await disconnectDb();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
