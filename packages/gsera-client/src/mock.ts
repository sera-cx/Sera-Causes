/**
 * Mock client: the same `GseraClient` interface backed by a pluggable store.
 *
 * The default store is an in-memory Map, which is enough for unit tests and a
 * single-process dev server. The indexer can supply a Postgres-backed store
 * (`{ get, set }`) so `GSERA_MODE=mock` survives restarts and multiple
 * processes see the same balances.
 *
 * The mock mirrors the gSera ledger model: lifetime `earned` is never reduced
 * by spending, `spendable = earned - spent`, grants are idempotent on
 * (grantType, referenceId) per wallet and spends on (reason, referenceId) per
 * wallet. Reversed grants are subtracted from `earned` but kept so a second
 * reversal is a no-op, exactly like gSera's `reverseGrant`.
 *
 * Concurrency: the mock does read, mutate, write. A store backed by a shared
 * database should serialise `get`/`set` per wallet (a row lock or an advisory
 * lock keyed on the wallet) if more than one process can spend at once.
 */
import { GseraError, InsufficientSpendable } from './errors.js';
import { parse } from './validate.js';
import {
  creditInputSchema,
  reverseInputSchema,
  spendInputSchema,
  walletSchema,
  type CreditInput,
  type CreditResult,
  type GrantType,
  type GseraClient,
  type Multipliers,
  type ReverseResult,
  type SpendInput,
  type SpendResult,
  type WalletInfo,
} from './types.js';

export interface MockGrant {
  id: string;
  grantType: GrantType;
  referenceId: string;
  amountGsera: number;
  reason: string;
  grantedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
}

export interface MockSpend {
  id: string;
  reason: string;
  referenceId: string;
  amountGsera: number;
  spentAt: string;
}

/** Everything the mock knows about one wallet. JSON-serialisable on purpose. */
export interface MockWalletState {
  /** Lifetime earned, including seeded balance, minus reversed grants. */
  earned: number;
  /** Sum of spends. */
  spent: number;
  grants: MockGrant[];
  spends: MockSpend[];
  multipliers: Multipliers;
}

export interface MockStore {
  get(wallet: string): Promise<MockWalletState | undefined> | MockWalletState | undefined;
  set(wallet: string, state: MockWalletState): Promise<void> | void;
}

export const DEFAULT_MULTIPLIERS: Multipliers = {
  volumeTier: 1.0,
  streak: 1.0,
  powerHour: 1.0,
  compound: 1.0,
};

export function emptyWalletState(multipliers: Partial<Multipliers> = {}): MockWalletState {
  return {
    earned: 0,
    spent: 0,
    grants: [],
    spends: [],
    multipliers: { ...DEFAULT_MULTIPLIERS, ...multipliers },
  };
}

/** Simple Map-backed store. Lives for the life of the process. */
export function createMemoryStore(): MockStore & { dump(): Record<string, MockWalletState> } {
  const map = new Map<string, MockWalletState>();
  return {
    get: (wallet) => map.get(wallet),
    set: (wallet, state) => {
      map.set(wallet, state);
    },
    dump: () => Object.fromEntries(map),
  };
}

export interface MockClientOptions {
  store?: MockStore;
  /** Clock, for deterministic timestamps in tests. */
  now?: () => Date;
}

export interface MockGseraClient extends GseraClient {
  readonly mode: 'mock';
  /** Reset a wallet so that its spendable balance equals `spendable` (earned = spendable, spent = 0). */
  seed(wallet: string, spendable: number, multipliers?: Partial<Multipliers>): Promise<WalletInfo>;
  /** Set the multipliers the mock reports for a wallet. */
  setMultipliers(wallet: string, multipliers: Partial<Multipliers>): Promise<WalletInfo>;
}

let counter = 0;
function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function createMockGseraClient(opts: MockClientOptions = {}): MockGseraClient {
  const store = opts.store ?? createMemoryStore();
  const now = opts.now ?? (() => new Date());

  async function load(wallet: string): Promise<MockWalletState> {
    const existing = await store.get(wallet);
    return existing ?? emptyWalletState();
  }

  function info(wallet: string, s: MockWalletState): WalletInfo {
    return {
      wallet,
      earned: round4(s.earned),
      spent: round4(s.spent),
      spendable: round4(Math.max(0, s.earned - s.spent)),
      multipliers: { ...s.multipliers },
    };
  }

  const client: MockGseraClient = {
    mode: 'mock',

    async credit(input: CreditInput): Promise<CreditResult> {
      const p = parse(creditInputSchema, input);
      const s = await load(p.wallet);
      const existing = s.grants.find((g) => g.grantType === p.grantType && g.referenceId === p.referenceId);
      if (existing) {
        return {
          status: 'already_granted',
          grantId: existing.id,
          wallet: p.wallet,
          amountGsera: existing.amountGsera,
          spendableAfter: info(p.wallet, s).spendable,
        };
      }
      const grant: MockGrant = {
        id: id('grt'),
        grantType: p.grantType,
        referenceId: p.referenceId,
        amountGsera: p.amountGsera,
        reason: p.reason,
        grantedAt: now().toISOString(),
        reversedAt: null,
        reversalReason: null,
      };
      s.grants.push(grant);
      s.earned = round4(s.earned + p.amountGsera);
      await store.set(p.wallet, s);
      return { status: 'granted', grantId: grant.id, wallet: p.wallet, amountGsera: p.amountGsera, spendableAfter: info(p.wallet, s).spendable };
    },

    async spend(input: SpendInput): Promise<SpendResult> {
      const p = parse(spendInputSchema, input);
      const s = await load(p.wallet);
      const existing = s.spends.find((x) => x.reason === p.reason && x.referenceId === p.referenceId);
      if (existing) {
        return { status: 'already_spent', spendId: existing.id, wallet: p.wallet, amountGsera: existing.amountGsera, spendableAfter: info(p.wallet, s).spendable };
      }
      const spendable = info(p.wallet, s).spendable;
      if (spendable < p.amountGsera) throw new InsufficientSpendable(spendable, p.amountGsera, p.wallet);
      const spend: MockSpend = { id: id('gss'), reason: p.reason, referenceId: p.referenceId, amountGsera: p.amountGsera, spentAt: now().toISOString() };
      s.spends.push(spend);
      s.spent = round4(s.spent + p.amountGsera);
      await store.set(p.wallet, s);
      return { status: 'spent', spendId: spend.id, wallet: p.wallet, amountGsera: p.amountGsera, spendableAfter: info(p.wallet, s).spendable };
    },

    async getWallet(address: string): Promise<WalletInfo> {
      const wallet = parse(walletSchema, address);
      return info(wallet, await load(wallet));
    },

    async reverseCredit(referenceId, grantType, wallet, reason = 'causes_reversal'): Promise<ReverseResult> {
      const p = parse(reverseInputSchema, { referenceId, grantType, wallet, reason });
      const s = await load(p.wallet);
      const grant = s.grants.find((g) => g.grantType === p.grantType && g.referenceId === p.referenceId);
      if (!grant) {
        throw new GseraError('Grant not found', { status: 404, code: 'NOT_FOUND', detail: { grantType: p.grantType, referenceId: p.referenceId, wallet: p.wallet } });
      }
      if (grant.reversedAt) {
        return { status: 'already_reversed', grantId: grant.id, wallet: p.wallet, amountGsera: grant.amountGsera };
      }
      grant.reversedAt = now().toISOString();
      grant.reversalReason = p.reason;
      s.earned = round4(s.earned - grant.amountGsera);
      await store.set(p.wallet, s);
      return { status: 'reversed', grantId: grant.id, wallet: p.wallet, amountGsera: grant.amountGsera };
    },

    async seed(address, spendable, multipliers = {}) {
      const wallet = parse(walletSchema, address);
      if (!Number.isFinite(spendable) || spendable < 0) {
        throw new GseraError('seed: spendable must be a non-negative number', { code: 'INVALID_INPUT' });
      }
      const s = emptyWalletState(multipliers);
      s.earned = round4(spendable);
      await store.set(wallet, s);
      return info(wallet, s);
    },

    async setMultipliers(address, multipliers) {
      const wallet = parse(walletSchema, address);
      const s = await load(wallet);
      s.multipliers = { ...s.multipliers, ...multipliers };
      await store.set(wallet, s);
      return info(wallet, s);
    },
  };

  return client;
}
