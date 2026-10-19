import { verifyTypedData } from "viem";
import { describe, expect, it } from "vitest";
import { createSettlement, SeraQuoteValidationError } from "../src/index.js";
import {
  BASE_URL,
  CHAIN_ID,
  GIVER,
  QUOTE_UUID,
  RECIPIENT,
  SERA,
  SERVER_TIME,
  SOR,
  USDC,
  XSGD,
  fakeFetch,
  giverAccount,
  quoteBody,
  seraRouter,
  type Router,
} from "./helpers.js";

function adapter(router: Router = seraRouter(), opts: Parameters<typeof createSettlement>[0] = {}) {
  const { fetchImpl, calls } = fakeFetch(router);
  let clock = SERVER_TIME * 1000;
  const settlement = createSettlement({
    network: "sepolia",
    baseUrl: BASE_URL,
    env: {},
    fetch: fetchImpl,
    now: () => clock,
    sleep: async () => undefined,
    ...opts,
  });
  return { settlement, calls, advance: (ms: number) => (clock += ms) };
}

const giftInput = { fromToken: "USDC", toToken: XSGD, fromAmountRaw: "1000000", giver: GIVER, recipient: RECIPIENT as `0x${string}` };

async function expectQuoteError(promise: Promise<unknown>, code: string, field?: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error, String(error)).toBeInstanceOf(SeraQuoteValidationError);
  expect((error as SeraQuoteValidationError).code).toBe(code);
  if (field) expect((error as SeraQuoteValidationError).field).toBe(field);
  return error as SeraQuoteValidationError;
}

describe("quoteGift", () => {
  it("posts the documented /swap/quote body anchored to Sera server time", async () => {
    const { settlement, calls } = adapter();
    const quote = await settlement.quoteGift({ ...giftInput, ttlSeconds: 120 });

    const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/swap/quote"));
    expect(post).toBeDefined();
    expect(post!.headers.authorization).toBeUndefined();
    expect(post!.body).toEqual({
      from_token: USDC,
      to_token: XSGD,
      from_amount: "1000000",
      owner_address: GIVER,
      recipient: RECIPIENT,
      expiration: SERVER_TIME + 120,
      gas_mode: "receive_less",
    });
    expect(calls.some((c) => c.path.endsWith("/system/time"))).toBe(true);

    expect(quote).toMatchObject({
      quoteId: QUOTE_UUID,
      network: "sepolia",
      chainId: CHAIN_ID,
      giver: GIVER,
      recipient: RECIPIENT,
      fromAmountRaw: "1000000",
      maxInputRaw: "1000000",
      minOutputRaw: "1330000",
      initialDepositRaw: "1000000",
      deadline: SERVER_TIME + 120,
      expiresAt: SERVER_TIME + 30,
      serverTime: SERVER_TIME,
      authorization: "permit",
      feeBreakdown: { gasCostUsd: "0.12", gasCostFromToken: "0.12" },
      eip712Domain: { name: "Sera", version: "1", chainId: CHAIN_ID, verifyingContract: SERA },
    });
    expect(quote.from.symbol).toBe("USDC");
    expect(quote.to.currency).toBe("SGD");
    expect(quote.permit?.spender).toBe(SOR);
  });

  it("clamps the signing window to [30, 600] seconds", async () => {
    const short = adapter(seraRouter(() => undefined, () => quoteBody({ expiration: SERVER_TIME + 30 })));
    await short.settlement.quoteGift({ ...giftInput, ttlSeconds: 5 });
    expect((short.calls.at(-1)!.body as { expiration: number }).expiration).toBe(SERVER_TIME + 30);

    const long = adapter(seraRouter(() => undefined, () => quoteBody({ expiration: SERVER_TIME + 600 })));
    await long.settlement.quoteGift({ ...giftInput, ttlSeconds: 99_999 });
    expect((long.calls.at(-1)!.body as { expiration: number }).expiration).toBe(SERVER_TIME + 600);
  });

  it("rejects an amount below the token floor without spending a quote", async () => {
    const { settlement, calls } = adapter();
    await expectQuoteError(settlement.quoteGift({ ...giftInput, fromAmountRaw: "99999" }), "amount_below_min");
    expect(calls.some((c) => c.path.endsWith("/swap/quote"))).toBe(false);
  });

  it("rejects a permit whose verifyingContract is not the input token", async () => {
    const wrong = () => quoteBody({ permit: { eip712: { domain: { verifyingContract: SOR } }, domain: { verifyingContract: SOR } } });
    const { settlement } = adapter(seraRouter(() => undefined, wrong));
    await expectQuoteError(settlement.quoteGift(giftInput), "invalid_quote", "quote.permit.eip712.domain.verifyingContract");
  });

  it("rejects a permit whose typed-data domain differs from permit.domain", async () => {
    const wrong = () => quoteBody({ permit: { eip712: { domain: { verifyingContract: XSGD } } } });
    const { settlement } = adapter(seraRouter(() => undefined, wrong));
    await expectQuoteError(settlement.quoteGift(giftInput), "invalid_quote", "quote.permit.eip712.domain");
  });

  it("rejects a permit spender that is not the live SOR", async () => {
    const wrong = () => quoteBody({ permit: { spender: SERA, eip712: { message: { spender: SERA } } } });
    const { settlement } = adapter(seraRouter(() => undefined, wrong));
    await expectQuoteError(settlement.quoteGift(giftInput), "invalid_quote", "quote.permit.spender");
  });

  it("rejects a permit deadline that outlives the signed Intent", async () => {
    const wrong = () => quoteBody({ permit: { suggested_deadline: SERVER_TIME + 121, eip712: { message: { deadline: SERVER_TIME + 121 } } } });
    const { settlement } = adapter(seraRouter(() => undefined, wrong));
    await expectQuoteError(settlement.quoteGift(giftInput), "invalid_quote", "quote.permit.eip712.message.deadline");
  });

  it("rejects route_params that do not echo the request", async () => {
    const taker = () => quoteBody({ route: { taker: RECIPIENT } });
    await expectQuoteError(adapter(seraRouter(() => undefined, taker)).settlement.quoteGift(giftInput), "invalid_quote", "quote.route_params.taker");
    const recipient = () => quoteBody({ route: { recipient: GIVER } });
    await expectQuoteError(adapter(seraRouter(() => undefined, recipient)).settlement.quoteGift(giftInput), "invalid_quote", "quote.route_params.recipient");
    const input = () => quoteBody({ route: { maxInputAmount: "999999", initialDepositAmount: "999999" } });
    await expectQuoteError(adapter(seraRouter(() => undefined, input)).settlement.quoteGift(giftInput), "invalid_quote", "quote.route_params.maxInputAmount");
  });

  it("treats minOutputAmount = 0 as no liquidity", async () => {
    const { settlement } = adapter(seraRouter(() => undefined, () => quoteBody({ route: { minOutputAmount: "0" } })));
    await expectQuoteError(settlement.quoteGift(giftInput), "no_liquidity");
  });

  it("rejects a wallet-funded quote without permit metadata", async () => {
    const { settlement } = adapter(seraRouter(() => undefined, () => quoteBody({ permit: null })));
    await expectQuoteError(settlement.quoteGift(giftInput), "invalid_quote", "quote.permit");
  });

  it("maps Sera NO_LIQUIDITY envelopes", async () => {
    const { settlement } = adapter(
      seraRouter((c) => (c.path.endsWith("/swap/quote") ? { status: 400, body: { detail: { detail: "No liquidity", error_code: "NO_LIQUIDITY" } } } : undefined)),
    );
    await expectQuoteError(settlement.quoteGift(giftInput), "no_liquidity");
  });

  it("caches deployment and currencies across quotes", async () => {
    const { settlement, calls } = adapter();
    await settlement.quoteGift(giftInput);
    await settlement.quoteGift(giftInput);
    expect(calls.filter((c) => c.path.endsWith("/config"))).toHaveLength(1);
    expect(calls.filter((c) => c.path.endsWith("/tokens"))).toHaveLength(1);
    expect(calls.filter((c) => c.path.endsWith("/swap/quote"))).toHaveLength(2);
  });
});

describe("buildSigningRequest", () => {
  it("returns Intent and Permit typed data that viem can sign and verify", async () => {
    const { settlement } = adapter();
    const quote = await settlement.quoteGift(giftInput);
    const request = settlement.buildSigningRequest(quote);

    expect(request.intent.domain).toEqual({ name: "Sera", version: "1", chainId: CHAIN_ID, verifyingContract: SERA });
    expect(request.intent.message).toEqual({
      taker: GIVER,
      inputToken: USDC,
      outputToken: XSGD,
      maxInputAmount: 1_000_000n,
      minOutputAmount: 1_330_000n,
      recipient: RECIPIENT,
      initialDepositAmount: 1_000_000n,
      uuid: 6431994229952211760403847975151123456789012345678901234567n,
      deadline: SERVER_TIME + 120,
    });
    expect(request.permit?.message).toEqual({ owner: GIVER, spender: SOR, value: 1_000_000n, nonce: 4n, deadline: BigInt(SERVER_TIME + 120) });

    const intentSig = await giverAccount.signTypedData(request.intent);
    expect(await verifyTypedData({ ...request.intent, address: giverAccount.address, signature: intentSig })).toBe(true);
    const permitSig = await giverAccount.signTypedData(request.permit!);
    expect(await verifyTypedData({ ...request.permit!, address: giverAccount.address, signature: permitSig })).toBe(true);
  });

  it("omits the permit when the token needs an on-chain approval instead", async () => {
    const approval = () => quoteBody({ permit: { permit_supported: false, permit_required: false, eip712: null, domain: null, nonce: null, suggested_deadline: null } });
    const { settlement } = adapter(seraRouter(() => undefined, approval));
    const quote = await settlement.quoteGift(giftInput);
    expect(quote.authorization).toBe("approval");
    expect(settlement.buildSigningRequest(quote).permit).toBeUndefined();
  });
});

describe("getDeployment", () => {
  it("rejects a config for the wrong chain", async () => {
    const { settlement } = adapter(seraRouter((c) => (c.path.endsWith("/config") ? { body: { ...quoteBody(), chain_id: 1, sera_address: SERA, vault_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02", sor_address: SOR, eip712_domain: { name: "Sera", version: "1", chainId: 1, verifyingContract: SERA } } } : undefined)));
    await expectQuoteError(settlement.getDeployment(), "unsupported_chain");
  });

  it("survives a /health outage and reports unhealthy", async () => {
    const { settlement } = adapter(seraRouter((c) => (c.path.endsWith("/health") ? { status: 503, body: { detail: "down" } } : undefined)));
    const deployment = await settlement.getDeployment();
    expect(deployment.seraAddress).toBe(SERA);
    expect(deployment.health).toMatchObject({ healthy: false, status: null });
  });
});

describe("fxRate", () => {
  it("queries /fx/rate with upper-cased codes and caches for a minute", async () => {
    const { settlement, calls, advance } = adapter(
      seraRouter((c) => (c.path.endsWith("/fx/rate") ? { body: { pair: "SGD/USD", rate: "0.74", as_of: SERVER_TIME, rate_24h_ago: "0.75", change_pct: "-1.3333" } } : undefined)),
    );
    const first = await settlement.fxRate("sgd", "usd");
    expect(first).toMatchObject({ pair: "SGD/USD", rate: "0.74", rate24hAgo: "0.75", changePct: "-1.3333" });
    expect(calls[0]!.query.get("base")).toBe("SGD");
    expect(calls[0]!.query.get("quote")).toBe("USD");
    await settlement.fxRate("SGD", "USD");
    expect(calls).toHaveLength(1);
    advance(61_000);
    await settlement.fxRate("SGD", "USD");
    expect(calls).toHaveLength(2);
    expect(await settlement.fxRate("USD", "usd")).toMatchObject({ rate: "1" });
    expect(calls).toHaveLength(2);
  });
});
