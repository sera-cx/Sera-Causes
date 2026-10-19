import {
  createMockSettlement,
  createSettlement,
  createKytClient,
  type SettlementAdapter,
  type KytClient,
} from '@sera-causes/sera-settlement';
import { config } from '../config.js';

let settlement: SettlementAdapter | undefined;
let kyt: KytClient | undefined;

export function getSettlement(): SettlementAdapter {
  if (settlement) return settlement;
  const c = config();
  if (c.settlementMode === 'live') {
    settlement = createSettlement({
      network: c.SERA_NETWORK,
      apiKey: c.SERA_API_KEY,
      apiSecret: c.SERA_API_SECRET,
      kyt: { mode: c.KYT_MODE, baseUrl: c.KYT_BASE_URL, apiKey: c.KYT_API_KEY, failClosed: c.KYT_FAIL_CLOSED },
    });
  } else {
    settlement = createMockSettlement({ network: c.SERA_NETWORK, kytFailClosed: c.KYT_FAIL_CLOSED });
  }
  return settlement;
}

export function getKyt(): KytClient {
  if (kyt) return kyt;
  const c = config();
  kyt = createKytClient({ mode: c.KYT_MODE, baseUrl: c.KYT_BASE_URL, apiKey: c.KYT_API_KEY, failClosed: c.KYT_FAIL_CLOSED });
  return kyt;
}

export function setSettlementForTests(s: SettlementAdapter | undefined, k?: KytClient): void {
  settlement = s;
  kyt = k;
}
