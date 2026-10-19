/**
 * Environment parsing. Names follow the root .env.example; extras are documented in README.md.
 */
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVerificationMode } from '@sera-causes/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
/** indexer/ regardless of whether we run from src or dist. */
export const INDEXER_ROOT = path.resolve(here, '..');

const bool = z
  .string()
  .optional()
  .transform((v) => v !== undefined && ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v.toLowerCase() as `0x${string}`);

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^0x[0-9a-f]{40}$/.test(s)),
  );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  CHAIN_ID: z.coerce.number().int().positive().default(11155111),
  RPC_URL: z.string().url().optional(),
  REGISTRY_ADDRESS: address.default('0x0000000000000000000000000000000000000000'),
  REGISTRY_FROM_BLOCK: z.coerce.number().int().nonnegative().default(0),
  FRONTEND_TAG: z.string().default('causes.sera.cx'),
  LISTENER_CHUNK: z.coerce.number().int().positive().default(5000),
  LISTENER_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  /** Override of the listed stablecoins: SYMBOL:address:decimals:currency, comma separated. */
  STABLECOINS: z.string().optional().transform((v) => (v ? v : undefined)),
  TREASURY_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  FINALISER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),

  DATABASE_URL: z.string().min(1),

  API_PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_DIR: z.string().default('./public'),
  /** Where seed/causes and seed/photos live (relative uris like seed/causes/x.json resolve here). */
  SEED_DIR: z.string().default(path.resolve(INDEXER_ROOT, '..', 'seed')),

  PRIVY_APP_ID: z.string().optional().transform((v) => (v ? v : undefined)),
  PRIVY_APP_SECRET: z.string().optional().transform((v) => (v ? v : undefined)),
  STEWARD_WALLETS: list,
  STEWARD_CACHE_SECONDS: z.coerce.number().int().positive().default(60),

  SETTLEMENT_MODE: z.enum(['mock', 'live']).optional(),
  SERA_NETWORK: z.enum(['sepolia', 'mainnet']).default('sepolia'),
  SERA_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  SERA_API_SECRET: z.string().optional().transform((v) => (v ? v : undefined)),

  GSERA_MODE: z.enum(['mock', 'live']).default('mock'),
  GSERA_BASE_URL: z.string().url().default('https://g.sera.cx'),
  GSERA_HMAC_KEY: z.string().default(''),

  /**
   * community.sera.cx, where helpers earn Care XP (docs/PLAN.md section 7).
   * `queue`: XP events are recorded here and left queued, which is all v1 can
   * do until `POST /api/partner/xp` is agreed. `live` will push them.
   */
  COMMUNITY_MODE: z.enum(['queue', 'live']).default('queue'),
  COMMUNITY_BASE_URL: z.string().url().default('https://community.sera.cx'),
  /** HMAC key for the `X-Sera-Signature` header on the partner route. */
  COMMUNITY_HMAC_KEY: z.string().default(''),

  KYT_MODE: z.enum(['stub', 'live']).default('stub'),
  KYT_BASE_URL: z.string().url().default('https://kyt.sera.cx'),
  KYT_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  KYT_FAIL_CLOSED: bool,

  RESEND_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  EMAIL_FROM: z.string().default('Care Share Donate <causes@sera.cx>'),

  VERIFICATION_MODE: z.string().optional(),
});

export type RawConfig = z.infer<typeof schema>;

export interface Config extends RawConfig {
  isProduction: boolean;
  verificationMode: ReturnType<typeof parseVerificationMode>;
  settlementMode: 'mock' | 'live';
  uploadDir: string;
  publicDir: string;
  seedDir: string;
  hasChain: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`invalid environment: ${issues}`);
  }
  const c = parsed.data;
  const zero = '0x0000000000000000000000000000000000000000';
  return {
    ...c,
    isProduction: c.NODE_ENV === 'production',
    verificationMode: parseVerificationMode(c.VERIFICATION_MODE),
    settlementMode: c.SETTLEMENT_MODE ?? (c.SERA_API_KEY ? 'live' : 'mock'),
    uploadDir: path.resolve(INDEXER_ROOT, c.UPLOAD_DIR),
    publicDir: path.resolve(INDEXER_ROOT, c.PUBLIC_DIR),
    seedDir: path.resolve(INDEXER_ROOT, c.SEED_DIR),
    hasChain: !!c.RPC_URL && c.REGISTRY_ADDRESS !== zero,
  };
}

let cached: Config | undefined;
/** Process-wide config, parsed once. Tests build their own with loadConfig(). */
export function config(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

export function setConfigForTests(c: Config): void {
  cached = c;
}
