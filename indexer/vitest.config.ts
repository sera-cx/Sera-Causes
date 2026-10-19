import { defineConfig } from 'vitest/config';
import path from 'node:path';

const base = process.env.DATABASE_URL ?? `postgresql://${process.env.USER ?? 'postgres'}@localhost:5432/sera_causes`;
export const TEST_DATABASE_URL = `${base}${base.includes('?') ? '&' : '?'}schema=sera_causes_test`;

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      LOG_LEVEL: 'silent',
      CHAIN_ID: '1337',
      REGISTRY_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      PUBLIC_API_URL: 'http://localhost:3001',
      PUBLIC_WEB_URL: 'http://localhost:3000',
      GSERA_MODE: 'mock',
      KYT_MODE: 'stub',
      SETTLEMENT_MODE: 'mock',
      VERIFICATION_MODE: 'advisory',
      STEWARD_WALLETS: '0x22d491bde2303f2f43325b2108d26f1eaba1e32b',
      UPLOAD_DIR: './uploads-test',
      PUBLIC_DIR: './public-test',
      SEED_DIR: path.resolve(__dirname, '..', 'seed'),
    },
  },
});
