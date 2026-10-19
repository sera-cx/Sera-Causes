/**
 * Error types thrown by the client. Every HTTP failure becomes a `GseraError`
 * carrying the status and the gSera error code; the one callers are expected
 * to branch on, a 402 from the spend route, gets its own subclass.
 */

export type GseraErrorCode =
  | 'BAD_SIGNATURE'
  | 'NOT_CONFIGURED'
  | 'INSUFFICIENT_GSERA'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'BAD_RESPONSE'
  | (string & {});

export class GseraError extends Error {
  readonly status: number | null;
  readonly code: GseraErrorCode;
  readonly detail: Record<string, unknown> | undefined;

  constructor(message: string, opts: { status?: number | null; code: GseraErrorCode; detail?: Record<string, unknown>; cause?: unknown }) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'GseraError';
    this.status = opts.status ?? null;
    this.code = opts.code;
    this.detail = opts.detail;
  }
}

/** Thrown by `spend` when the wallet's spendable balance is below the amount (HTTP 402). */
export class InsufficientSpendable extends GseraError {
  readonly spendable: number;
  readonly required: number;

  constructor(spendable: number, required: number, wallet?: string) {
    super(`Insufficient spendable gSera: have ${spendable}, need ${required}`, {
      status: 402,
      code: 'INSUFFICIENT_GSERA',
      detail: { spendable, required, wallet },
    });
    this.name = 'InsufficientSpendable';
    this.spendable = spendable;
    this.required = required;
  }
}

/** Thrown when the client is misconfigured (missing key or base URL). */
export class GseraConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GseraConfigError';
  }
}
