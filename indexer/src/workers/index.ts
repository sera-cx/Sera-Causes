/**
 * Workers: listener (15 s), treasury (60 s), settlement poll (30 s), claim settlement
 * and queued credits (hourly), snapshot (5 min), email outbox (30 s).
 */
import { config } from '../config.js';
import { logger } from '../log.js';
import { disconnectDb } from '../db.js';
import { runListenerOnce } from '../chain/listener.js';
import { settleDueClaims } from '../ledger/rewards.js';
import { retryQueued } from '../ledger/credit.js';
import { pollSettlementsOnce } from './settlement.js';
import { writeSnapshot } from './snapshot.js';
import { sendOutboxOnce } from './email.js';
import { runTreasuryOnce } from './treasury.js';

interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const c = config();
const jobs: Job[] = [
  { name: 'listener', everyMs: c.LISTENER_INTERVAL_MS, run: runListenerOnce },
  { name: 'treasury', everyMs: c.TREASURY_INTERVAL_MS, run: runTreasuryOnce },
  { name: 'settlement-poll', everyMs: 30_000, run: pollSettlementsOnce },
  { name: 'claims-and-credits', everyMs: 60 * 60 * 1000, run: async () => ({ settled: await settleDueClaims(), credits: await retryQueued() }) },
  { name: 'snapshot', everyMs: 5 * 60 * 1000, run: writeSnapshot },
  { name: 'email', everyMs: 30_000, run: sendOutboxOnce },
];

const timers: NodeJS.Timeout[] = [];
const running = new Set<string>();

function schedule(job: Job): void {
  const tick = async () => {
    if (running.has(job.name)) return;
    running.add(job.name);
    try {
      const result = await job.run();
      logger.debug({ job: job.name, result }, 'job done');
    } catch (err) {
      logger.error({ err, job: job.name }, 'job failed');
    } finally {
      running.delete(job.name);
    }
  };
  void tick();
  timers.push(setInterval(() => void tick(), job.everyMs));
}

for (const job of jobs) schedule(job);
logger.info({ jobs: jobs.map((j) => `${j.name} every ${Math.round(j.everyMs / 1000)}s`), chain: c.hasChain }, 'workers started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'workers shutting down');
  for (const t of timers) clearInterval(t);
  await disconnectDb();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
