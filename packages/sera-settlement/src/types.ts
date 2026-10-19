/**
 * Zod schemas for the Sera.cx REST responses this package consumes. Shapes
 * follow docs.sera.cx (api-reference/endpoints/{system,swaps,orders}.md),
 * sera-mcp `src/sera/types.ts` and sera-pay `server/sera-api.ts`.
 *
 * These schemas describe the wire envelope and are deliberately tolerant of
 * extra fields (Sera evolves quickly). Cross-field security checks (domain
 * pinning, amounts, deadlines, settlement economics) live in `validate.ts`.
 */
import { z } from "zod";

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
export const HEX_RE = /^0x[0-9a-fA-F]*$/;
export const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const UINT_RE = /^(0|[1-9]\d*)$/;

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export const addressSchema = z.string().regex(ADDRESS_RE, "must be a 20-byte hex address");
export const hexSchema = z.string().regex(HEX_RE, "must be 0x-prefixed hex");

/** Unsigned integer as decimal string; accepts number/bigint/string on the wire. */
export const uintStringSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((v, ctx) => {
    let text: string;
    if (typeof v === "bigint") text = v.toString();
    else if (typeof v === "number") {
      if (!Number.isSafeInteger(v) || v < 0) {
        ctx.addIssue({ code: "custom", message: "must be a safe unsigned integer" });
        return z.NEVER;
      }
      text = String(v);
    } else text = v.trim();
    if (!UINT_RE.test(text)) {
      ctx.addIssue({ code: "custom", message: "must be an unsigned decimal integer" });
      return z.NEVER;
    }
    return text;
  });

/** Unix timestamp (seconds) that may arrive as number or numeric string. */
export const unixSecondsSchema = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    ctx.addIssue({ code: "custom", message: "must be a positive unix timestamp" });
    return z.NEVER;
  }
  return Math.floor(n);
});

const decimalStringSchema = z.union([z.string(), z.number()]).transform((v) => (typeof v === "number" ? String(v) : v.trim()));

// ---- GET /config ----------------------------------------------------------

export const eip712DomainSchema = z.object({
  name: z.string(),
  version: z.string(),
  chainId: z.union([z.number(), z.string()]),
  verifyingContract: z.string(),
});

/**
 * /config "intentionally stays available even during partial startup" and may
 * return nulls. The envelope accepts them; `validateDeploymentConfig` rejects
 * them so callers retry instead of signing against a half-booted deployment.
 */
export const seraConfigSchema = z.looseObject({
  chain_id: z.union([z.number(), z.string()]).nullable(),
  sera_address: z.string().nullable(),
  vault_address: z.string().nullable(),
  sor_address: z.string().nullable(),
  domain_separator: z.string().nullish(),
  eip712_domain: eip712DomainSchema.nullish(),
  limits: z.unknown().optional(),
});
export type SeraConfigResponse = z.infer<typeof seraConfigSchema>;

// ---- GET /health ----------------------------------------------------------

export const healthSchema = z.looseObject({
  status: z.string(),
  version: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  executor_id: z.union([z.number(), z.string()]).nullish(),
  relayer_executor_id: z.union([z.number(), z.string()]).nullish(),
  signature_ready: z.boolean().nullish(),
});
export type HealthResponse = z.infer<typeof healthSchema>;

// ---- GET /system/time -----------------------------------------------------

export const systemTimeSchema = z.object({ timestamp: unixSecondsSchema });
export type SystemTimeResponse = z.infer<typeof systemTimeSchema>;

// ---- GET /tokens ----------------------------------------------------------

export const seraTokenSchema = z.looseObject({
  symbol: z.string().min(1),
  address: addressSchema,
  decimals: z.number().int().min(0).max(255),
  /** docs.sera.cx name for the fiat tag. */
  currency: z.string().nullish(),
  /** sera-mcp name for the same tag. */
  fiat_currency: z.string().nullish(),
  name: z.string().nullish(),
  min_trade_amount_raw: uintStringSchema.nullish(),
  min_trade_amount: decimalStringSchema.nullish(),
});
export const tokensResponseSchema = z.object({ tokens: z.array(seraTokenSchema) });
export type SeraToken = z.infer<typeof seraTokenSchema>;

// ---- GET /markets ---------------------------------------------------------

export const seraMarketSchema = z.looseObject({
  /** docs.sera.cx: "EURC/USDC"; sera-mcp calls it display_pair. */
  symbol: z.string().optional(),
  display_pair: z.string().optional(),
  base_symbol: z.string(),
  quote_symbol: z.string(),
  base_address: addressSchema.optional(),
  quote_address: addressSchema.optional(),
  base_token: addressSchema.optional(),
  quote_token: addressSchema.optional(),
  tick_precision: z.number().optional(),
  quantity_precision: z.number().optional(),
  base_decimals: z.number().optional(),
  quote_decimals: z.number().optional(),
  min_ask_amount_raw: uintStringSchema.nullish(),
  min_bid_quote_amount_raw: uintStringSchema.nullish(),
});
export const marketsResponseSchema = z.object({ markets: z.array(seraMarketSchema) });
export type SeraMarket = z.infer<typeof seraMarketSchema>;

// ---- GET /fx/rate ---------------------------------------------------------

export const fxRateSchema = z.looseObject({
  pair: z.string().optional(),
  base: z.string().optional(),
  quote: z.string().optional(),
  rate: decimalStringSchema,
  as_of: z.number().nullish(),
  rate_24h_ago: decimalStringSchema.nullish(),
  as_of_24h_ago: z.number().nullish(),
  change_pct: decimalStringSchema.nullish(),
  change_24h: decimalStringSchema.nullish(),
  source: z.string().nullish(),
});
export type FxRateResponse = z.infer<typeof fxRateSchema>;

// ---- POST /swap/quote -----------------------------------------------------

export const gasModeSchema = z.enum(["receive_less", "pay_more"]);
export type GasMode = z.infer<typeof gasModeSchema>;

export const swapQuoteRequestSchema = z.object({
  from_token: addressSchema,
  to_token: addressSchema,
  from_amount: uintStringSchema,
  owner_address: addressSchema,
  recipient: addressSchema,
  expiration: z.number().int().positive(),
  gas_mode: gasModeSchema,
});
export type SwapQuoteRequest = z.infer<typeof swapQuoteRequestSchema>;

/** EIP-712 Intent struct (Sera SOR), as returned in `route_params`. */
export const routeParamsSchema = z.object({
  taker: z.string(),
  inputToken: z.string(),
  outputToken: z.string(),
  maxInputAmount: uintStringSchema,
  minOutputAmount: uintStringSchema,
  recipient: z.string(),
  initialDepositAmount: uintStringSchema,
  uuid: uintStringSchema,
  deadline: uintStringSchema,
});
export type RouteParams = z.infer<typeof routeParamsSchema>;

export const permitTypedDataSchema = z.looseObject({
  domain: eip712DomainSchema,
  primaryType: z.string(),
  types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() }))),
  message: z.looseObject({
    owner: z.string(),
    spender: z.string(),
    value: uintStringSchema,
    nonce: uintStringSchema,
    deadline: uintStringSchema,
  }),
});

export const permitEnvelopeSchema = z.looseObject({
  permit_supported: z.boolean(),
  permit_required: z.boolean(),
  token: z.string(),
  spender: z.string(),
  owner: z.string(),
  value_raw: uintStringSchema,
  current_allowance_raw: uintStringSchema,
  nonce: uintStringSchema.nullish(),
  suggested_deadline: uintStringSchema.nullish(),
  domain: eip712DomainSchema.nullish(),
  eip712: permitTypedDataSchema.nullish(),
});
export type PermitEnvelope = z.infer<typeof permitEnvelopeSchema>;

export const feeBreakdownSchema = z.looseObject({
  gas_cost_usd: decimalStringSchema.nullish(),
  gas_cost_from_token: decimalStringSchema.nullish(),
});

const swapQuoteBodySchema = z.looseObject({
  uuid: z.string(),
  route_params: routeParamsSchema,
  fee_breakdown: feeBreakdownSchema.nullish(),
  expires_at: unixSecondsSchema,
  permit: permitEnvelopeSchema.nullish(),
});

/** Accepts both the bare quote and a `{ quote: {...} }` envelope (sera-pay `quoteRecord`). */
export const swapQuoteResponseSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, "quote")) {
    return (raw as { quote: unknown }).quote;
  }
  return raw;
}, swapQuoteBodySchema);
export type SwapQuoteResponse = z.infer<typeof swapQuoteBodySchema>;

// ---- POST /swap -----------------------------------------------------------

export const swapExecuteRequestSchema = z
  .object({
    uuid: z.string().regex(UUID_RE, "uuid must be the quote record UUID from POST /swap/quote"),
    signature: hexSchema,
    permit_signature: hexSchema.optional(),
    permit_deadline: z.number().int().positive().optional(),
  })
  .refine((v) => (v.permit_signature === undefined) === (v.permit_deadline === undefined), {
    message: "permit_signature and permit_deadline must be provided together (both or neither)",
  });
export type SwapExecuteRequest = z.infer<typeof swapExecuteRequestSchema>;

export const swapExecuteResponseSchema = z.looseObject({
  success: z.boolean(),
  trade_id: z.string().nullish(),
  status: z.string().nullish(),
  fee_breakdown: feeBreakdownSchema.nullish(),
  error: z.string().nullish(),
  error_code: z.string().nullish(),
  message: z.string().nullish(),
});
export type SwapExecuteResponse = z.infer<typeof swapExecuteResponseSchema>;

// ---- GET /orders/{trade_id} -----------------------------------------------

export const tokenAmountSchema = z.looseObject({
  type: z.string().optional(),
  token: z.string().optional(),
  token_address: z.string(),
  amount: decimalStringSchema.optional(),
  amount_raw: uintStringSchema,
});

export const settlementSummarySchema = z.looseObject({
  status: z.string().nullish(),
  total_fill_count: z.number().nullish(),
  pending_fill_count: z.number().nullish(),
  settled_fill_count: z.number().nullish(),
  failed_fill_count: z.number().nullish(),
  reverted_fill_count: z.number().nullish(),
  latest_settlement_id: z.union([z.number(), z.string()]).nullish(),
  latest_tx_hash: z.string().nullish(),
  latest_parent_status: z.string().nullish(),
  latest_fill_settlement_status: z.string().nullish(),
  latest_failed_fill_failure_reason: z.string().nullish(),
});

export const settlementEconomicsSchema = z.looseObject({
  perspective_order_id: z.string(),
  gross_debits: z.array(tokenAmountSchema).optional(),
  gross_credits: z.array(tokenAmountSchema).optional(),
  balance_debits: z.array(tokenAmountSchema),
  balance_credits: z.array(tokenAmountSchema),
  fees_paid: z.array(tokenAmountSchema),
});

export const orderStatusSchema = z.enum(["pending", "matched", "settled", "failed", "cancelled", "canceled"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * Tracked order. `settlement_summary` / `settlement_economics` are kept as
 * `unknown` here because they are null while pending; `validateSettledOrder`
 * applies the strict shape once `status === "settled"`.
 */
export const trackedOrderSchema = z.looseObject({
  trade_id: z.string(),
  owner_address: z.string(),
  status: z.string(),
  order_type: z.string(),
  from_token: z.string().nullish(),
  to_token: z.string().nullish(),
  from_amount: decimalStringSchema.nullish(),
  to_amount: decimalStringSchema.nullish(),
  filled_amount: decimalStringSchema.nullish(),
  expiration: z.union([z.string(), z.number()]).nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  error: z.string().nullish(),
  error_code: z.string().nullish(),
  settlement_summary: z.unknown().nullish(),
  settlement_economics: z.unknown().nullish(),
});
export type TrackedOrder = z.infer<typeof trackedOrderSchema>;

// ---- helpers --------------------------------------------------------------

export class SeraSchemaError extends Error {
  override readonly name = "SeraSchemaError";
  constructor(
    readonly endpoint: string,
    readonly issues: z.core.$ZodIssue[],
    readonly body: unknown,
  ) {
    super(`Sera ${endpoint} response did not match the expected shape: ${issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ")}`);
  }
}

export function parseResponse<S extends z.ZodType>(schema: S, endpoint: string, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw new SeraSchemaError(endpoint, result.error.issues, body);
  return result.data;
}
