import { describe, expect, it } from "vitest";
import { createSettlement, normaliseTrackedOrder, SeraSettlementValidationError, validateSettledOrder } from "../src/index.js";
import { BASE_URL, GIVER, SERVER_TIME, TRADE_ID, TX_HASH, USDC, XSGD, fakeFetch, orderBody } from "./helpers.js";

const expectation = { tradeId: TRADE_ID, payerAddress: GIVER, inputTokenAddress: USDC, outputTokenAddress: XSGD, targetOutputAmountRaw: "1330000" };

function expectCode(fn: () => unknown, code: SeraSettlementValidationError["code"]) {
  let error: unknown;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  expect(error, String(error)).toBeInstanceOf(SeraSettlementValidationError);
  expect((error as SeraSettlementValidationError).code).toBe(code);
  return error as SeraSettlementValidationError;
}

describe("validateSettledOrder", () => {
  it("normalises identity, economics, fees and tx hash", () => {
    const result = validateSettledOrder(
      orderBody({ owner_address: GIVER.toUpperCase().replace("0X", "0x"), settlement_summary: { latest_tx_hash: TX_HASH.toUpperCase().replace("0X", "0x") } }),
      expectation,
    );
    expect(result).toEqual({
      tradeId: TRADE_ID,
      status: "settled",
      payerAddress: GIVER,
      inputTokenAddress: USDC,
      outputTokenAddress: XSGD,
      actualPayRaw: "1000000",
      actualReceiveRaw: "1330000",
      fees: [{ token: XSGD, amountRaw: "10000" }],
      txHash: TX_HASH,
    });
  });

  it.each([
    ["trade id", { trade_id: "other" }, "TRADE_ID_MISMATCH"],
    ["payer", { owner_address: "0x9999999999999999999999999999999999999999" }, "PAYER_MISMATCH"],
    ["order type", { order_type: "limit" }, "ORDER_TYPE_MISMATCH"],
    ["input token", { from_token: XSGD }, "INPUT_TOKEN_MISMATCH"],
    ["output token", { to_token: USDC }, "OUTPUT_TOKEN_MISMATCH"],
  ] as const)("rejects a mismatched %s", (_label, overrides, code) => {
    expectCode(() => validateSettledOrder(orderBody(overrides), expectation), code);
  });

  it("rejects malformed settlement_summary and settlement_economics", () => {
    expectCode(() => validateSettledOrder(orderBody({ settlement_summary: null }), expectation), "MALFORMED_ORDER");
    expectCode(() => validateSettledOrder(orderBody({ settlement_summary: { latest_tx_hash: "0x1234" } }), expectation), "INVALID_SETTLEMENT_TX_HASH");
    expectCode(() => validateSettledOrder(orderBody({ settlement_summary: { latest_tx_hash: `0x${"0".repeat(64)}` } }), expectation), "INVALID_SETTLEMENT_TX_HASH");
    expectCode(() => validateSettledOrder(orderBody({ settlement_economics: null }), expectation), "MALFORMED_ORDER");
    expectCode(() => validateSettledOrder(orderBody({ settlement_economics: { ...orderBody().settlement_economics, perspective_order_id: "other" } }), expectation), "PERSPECTIVE_ORDER_ID_MISMATCH");
    expectCode(
      () => validateSettledOrder(orderBody({ settlement_economics: { ...orderBody().settlement_economics, balance_debits: [{ token_address: USDC, amount_raw: 1000000 }] } }), expectation),
      "MALFORMED_ORDER",
    );
    expectCode(
      () => validateSettledOrder(orderBody({ settlement_economics: { ...orderBody().settlement_economics, balance_credits: "nope" } }), expectation),
      "MALFORMED_ORDER",
    );
  });

  it("rejects economics in the wrong tokens or below the quoted minimum", () => {
    const econ = orderBody().settlement_economics;
    expectCode(() => validateSettledOrder(orderBody({ settlement_economics: { ...econ, balance_debits: [{ token_address: XSGD, amount_raw: "1" }] } }), expectation), "DEBIT_TOKEN_MISMATCH");
    expectCode(() => validateSettledOrder(orderBody({ settlement_economics: { ...econ, balance_debits: [] } }), expectation), "MISSING_INPUT_DEBIT");
    expectCode(() => validateSettledOrder(orderBody({ settlement_economics: { ...econ, balance_credits: [{ token_address: USDC, amount_raw: "1" }] } }), expectation), "MISSING_OUTPUT_CREDIT");
    const under = expectCode(
      () => validateSettledOrder(orderBody({ settlement_economics: { ...econ, balance_credits: [{ token_address: XSGD, amount_raw: "1329999" }] } }), expectation),
      "OUTPUT_UNDERPAID",
    );
    expect(under.expected).toBe("1330000");
    expect(under.actual).toBe("1329999");
  });

  it("treats pending as retryable, never as settled", () => {
    const error = expectCode(() => validateSettledOrder(orderBody({ status: "pending", settlement_summary: null, settlement_economics: null }), expectation), "ORDER_NOT_SETTLED");
    expect(error.retryable).toBe(true);
  });
});

describe("normaliseTrackedOrder", () => {
  it("maps pending/matched, settled and failed to normalised states", () => {
    expect(normaliseTrackedOrder(orderBody({ status: "matched", settlement_summary: null, settlement_economics: null }), expectation)).toMatchObject({
      state: "pending",
      status: "matched",
      received: null,
      feesPaid: [],
    });
    expect(normaliseTrackedOrder(orderBody(), expectation)).toMatchObject({
      state: "settled",
      txHash: TX_HASH,
      paid: { token: USDC, amountRaw: "1000000" },
      received: { token: XSGD, amountRaw: "1330000" },
      feesPaid: [{ token: XSGD, amountRaw: "10000" }],
    });
    expect(
      normaliseTrackedOrder(orderBody({ status: "failed", error_code: "INTENT_DEADLINE_EXPIRED", error: "deadline passed", settlement_economics: null }), expectation),
    ).toMatchObject({ state: "failed", errorCode: "INTENT_DEADLINE_EXPIRED", error: "deadline passed", received: null });
  });

  it("rejects an undocumented status instead of guessing", () => {
    expectCode(() => normaliseTrackedOrder(orderBody({ status: "weird" }), expectation), "MALFORMED_ORDER");
  });
});

describe("getSettlement", () => {
  it("reads /orders/{trade_id} with the API key and validates strictly", async () => {
    const { fetchImpl, calls } = fakeFetch((c) => (c.path.endsWith(`/orders/${TRADE_ID}`) ? { body: orderBody() } : undefined));
    const settlement = createSettlement({ network: "sepolia", baseUrl: BASE_URL, env: {}, apiKey: "k", apiSecret: "s", fetch: fetchImpl, now: () => SERVER_TIME * 1000 });
    const result = await settlement.getSettlement(TRADE_ID, { payerAddress: GIVER, inputTokenAddress: USDC, outputTokenAddress: XSGD, targetOutputAmountRaw: "1330000" });
    expect(calls[0]!.headers.authorization).toBe("Bearer k:s");
    expect(result.state).toBe("settled");
    expect(result.received).toEqual({ token: XSGD, amountRaw: "1330000" });
  });

  it("fails without credentials and on a trade id mismatch", async () => {
    const noCreds = createSettlement({ network: "sepolia", baseUrl: BASE_URL, env: {}, fetch: fakeFetch(() => ({ body: {} })).fetchImpl });
    await expect(noCreds.getSettlement(TRADE_ID)).rejects.toMatchObject({ status: 401, code: "MISSING_CREDENTIALS" });

    const { fetchImpl } = fakeFetch(() => ({ body: orderBody({ trade_id: "someone-elses" }) }));
    const settlement = createSettlement({ network: "sepolia", baseUrl: BASE_URL, env: {}, apiKey: "k", apiSecret: "s", fetch: fetchImpl });
    await expect(settlement.getSettlement(TRADE_ID)).rejects.toMatchObject({ code: "TRADE_ID_MISMATCH" });
  });
});
