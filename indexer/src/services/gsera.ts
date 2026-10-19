import { createGseraClient, type GseraClient, type MockStore, type MockWalletState } from '@sera-causes/gsera-client';
import { config } from '../config.js';
import { db } from '../db.js';

let client: GseraClient | undefined;

/** Postgres-backed store for the gSera mock so the full flow works locally across processes. */
export function prismaMockStore(): MockStore {
  return {
    async get(wallet) {
      const row = await db().mockGseraWallet.findUnique({ where: { wallet: wallet.toLowerCase() } });
      return row ? (row.state as unknown as MockWalletState) : undefined;
    },
    async set(wallet, state) {
      const w = wallet.toLowerCase();
      const json = JSON.parse(JSON.stringify(state));
      await db().mockGseraWallet.upsert({ where: { wallet: w }, create: { wallet: w, state: json }, update: { state: json } });
    },
  };
}

export function getGsera(): GseraClient {
  if (client) return client;
  const c = config();
  client =
    c.GSERA_MODE === 'live'
      ? createGseraClient({ mode: 'live', baseUrl: c.GSERA_BASE_URL, hmacKey: c.GSERA_HMAC_KEY })
      : createGseraClient({ mode: 'mock', store: prismaMockStore() });
  return client;
}

export function setGseraForTests(g: GseraClient | undefined): void {
  client = g;
}
