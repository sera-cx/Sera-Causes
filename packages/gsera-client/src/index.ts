/**
 * @sera-causes/gsera-client
 *
 *   const gsera = createGseraClient({ mode: 'live', baseUrl, hmacKey });
 *   const gsera = createGseraClient({ mode: 'mock', store });
 *
 * Both return a `GseraClient` with `credit`, `spend`, `getWallet` and
 * `reverseCredit`. The mock additionally exposes `seed` and `setMultipliers`.
 */
import { GseraConfigError } from './errors.js';
import { LiveGseraClient, type LiveClientOptions } from './live.js';
import { createMockGseraClient, type MockClientOptions, type MockGseraClient } from './mock.js';
import type { GseraClient } from './types.js';

export interface LiveModeOptions extends LiveClientOptions {
  mode: 'live';
}

export interface MockModeOptions extends MockClientOptions {
  mode: 'mock';
  /** Ignored in mock mode; accepted so one env-driven options object works for both. */
  baseUrl?: string;
  /** Ignored in mock mode. */
  hmacKey?: string;
}

export type GseraClientOptions = LiveModeOptions | MockModeOptions;

export function createGseraClient(opts: LiveModeOptions): GseraClient;
export function createGseraClient(opts: MockModeOptions): MockGseraClient;
export function createGseraClient(opts: GseraClientOptions): GseraClient;
export function createGseraClient(opts: GseraClientOptions): GseraClient {
  switch (opts.mode) {
    case 'live': {
      const { mode: _mode, ...rest } = opts;
      return new LiveGseraClient(rest);
    }
    case 'mock': {
      const { mode: _mode, baseUrl: _b, hmacKey: _k, ...rest } = opts;
      return createMockGseraClient(rest);
    }
    default: {
      const m = (opts as { mode?: unknown }).mode;
      throw new GseraConfigError(`gsera-client: unknown mode ${String(m)} (expected 'live' or 'mock')`);
    }
  }
}

export { LiveGseraClient } from './live.js';
export type { LiveClientOptions, FetchLike } from './live.js';
export {
  createMockGseraClient,
  createMemoryStore,
  emptyWalletState,
  DEFAULT_MULTIPLIERS,
} from './mock.js';
export type { MockClientOptions, MockGseraClient, MockStore, MockWalletState, MockGrant, MockSpend } from './mock.js';
export { GseraError, GseraConfigError, InsufficientSpendable } from './errors.js';
export type { GseraErrorCode } from './errors.js';
export { signBody, SIGNATURE_HEADER, EMPTY_BODY } from './signature.js';
export {
  GRANT_TYPES,
  SPEND_REASONS,
  GSERA_PRODUCTION_URL,
  walletSchema,
  creditInputSchema,
  spendInputSchema,
  reverseInputSchema,
} from './types.js';
export type {
  GrantType,
  SpendReason,
  Multipliers,
  WalletInfo,
  CreditInput,
  CreditResult,
  SpendInput,
  SpendResult,
  ReverseResult,
  GseraClient,
} from './types.js';
