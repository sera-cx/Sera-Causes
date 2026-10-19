/**
 * The listed stablecoins whose Transfer logs the listener scans. Source order:
 * STABLECOINS env override, settlement `listCurrencies`, then the static
 * Sepolia fallback. Cached in the Token table.
 */
import { config } from '../config.js';
import { db } from '../db.js';
import { getSettlement } from '../services/settlement.js';
import { logger } from '../log.js';

export interface Stablecoin {
  address: string;
  symbol: string;
  decimals: number;
  currency: string;
}

/** Static fallback for Sepolia. Only Circle's test USDC is a known public deployment; set STABLECOINS for the rest. */
export const SEPOLIA_STABLECOINS: readonly Stablecoin[] = [
  { address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', symbol: 'USDC', decimals: 6, currency: 'USD' },
];

const CURRENCY_BY_SYMBOL: Record<string, string> = { USDT: 'USD', USDC: 'USD', XSGD: 'SGD', MYRT: 'MYR', EURC: 'EUR', DAI: 'USD' };

export function currencyForSymbol(symbol: string): string {
  return CURRENCY_BY_SYMBOL[symbol.toUpperCase()] ?? 'USD';
}

/** Parses STABLECOINS="USDT:0x..:6:USD,XSGD:0x..:6:SGD". */
export function parseStablecoinList(raw: string | undefined): Stablecoin[] {
  if (!raw) return [];
  const out: Stablecoin[] = [];
  for (const part of raw.split(',')) {
    const [symbol, address, decimals, currency] = part.split(':').map((s) => s.trim());
    if (!symbol || !address || !/^0x[0-9a-fA-F]{40}$/.test(address)) continue;
    out.push({ symbol, address: address.toLowerCase(), decimals: Number(decimals ?? 6) || 6, currency: currency ?? currencyForSymbol(symbol) });
  }
  return out;
}

let cache: { list: Stablecoin[]; at: number } | undefined;
const TTL_MS = 10 * 60 * 1000;

export async function listStablecoins(opts: { fresh?: boolean } = {}): Promise<Stablecoin[]> {
  if (cache && !opts.fresh && Date.now() - cache.at < TTL_MS) return cache.list;
  const c = config();
  let list = parseStablecoinList(c.STABLECOINS);
  if (list.length === 0) {
    try {
      const cur = await getSettlement().listCurrencies();
      list = cur.tokens.map((t) => ({ address: t.address.toLowerCase(), symbol: t.symbol, decimals: t.decimals, currency: t.currency ?? currencyForSymbol(t.symbol) }));
    } catch (err) {
      logger.warn({ err }, 'listCurrencies failed; using fallback stablecoin list');
    }
  }
  if (list.length === 0) {
    const stored = await db().token.findMany({ where: { accepted: true } });
    list = stored.length ? stored.map((t) => ({ address: t.address, symbol: t.symbol, decimals: t.decimals, currency: t.currency })) : [...SEPOLIA_STABLECOINS];
  }
  for (const t of list) {
    await db().token.upsert({
      where: { address: t.address },
      create: { address: t.address, symbol: t.symbol, decimals: t.decimals, currency: t.currency, accepted: true },
      update: { symbol: t.symbol, decimals: t.decimals, currency: t.currency, accepted: true },
    });
  }
  cache = { list, at: Date.now() };
  return list;
}

export function clearStablecoinCache(): void {
  cache = undefined;
}

export async function stablecoinByAddress(address: string): Promise<Stablecoin | undefined> {
  const a = address.toLowerCase();
  return (await listStablecoins()).find((t) => t.address === a);
}

export async function stablecoinByRef(ref: string): Promise<Stablecoin | undefined> {
  const list = await listStablecoins();
  const r = ref.toLowerCase();
  return list.find((t) => t.address === r) ?? list.find((t) => t.symbol.toLowerCase() === r);
}
