import { verifyTypedData } from "viem";
import { describe, expect, it } from "vitest";
import { createMockSettlement, MOCK_ADDRESSES, mockMinOutput, SeraApiError } from "../src/index.js";
import { giverAccount, RECIPIENT } from "./helpers.js";

const giver = giverAccount.address;
const recipient = RECIPIENT as `0x${string}`;

describe("createMockSettlement", () => {
  it("quotes 1:1 minus 10 bps, deterministically", async () => {
    const mock = createMockSettlement({ now: () => 1_800_000_000_000 });
    const a = await mock.quoteGift({ fromToken: "USDC", toToken: "XSGD", fromAmountRaw: "1000000", giver, recipient });
    const b = await mock.quoteGift({ fromToken: "usdc", toToken: "xsgd", fromAmountRaw: 1_000_000n, giver, recipient });
    expect(a.minOutputRaw).toBe("999000");
    expect(a.maxInputRaw).toBe("1000000");
    expect(a.quoteId).toBe(b.quoteId);
    expect(a.routeParams.uuid).toBe(b.routeParams.uuid);
    expect(a.authorization).toBe("permit");
    expect(a.deadline).toBe(1_800_000_000 + 120);
    expect(a.expiresAt).toBe(1_800_000_000 + 30);
  });

  it("adjusts for differing decimals", () => {
    const from = { symbol: "A", address: "0x1000000000000000000000000000000000000001" as const, decimals: 18, currency: null, name: null, minTradeAmountRaw: "0" };
    const to = { symbol: "B", address: "0x1000000000000000000000000000000000000002" as const, decimals: 6, currency: null, name: null, minTradeAmountRaw: "0" };
    expect(mockMinOutput(10n ** 18n, from, to)).toBe(999_000n);
    expect(mockMinOutput(1_000_000n, to, from)).toBe(999_000n * 10n ** 12n);
  });

  it("produces signable typed data and walks a gift to settlement", async () => {
    const mock = createMockSettlement({ settleAfterPolls: 1 });
    const quote = await mock.quoteGift({ fromToken: "USDC", toToken: "MYRT", fromAmountRaw: "5000000", giver, recipient });
    const request = mock.buildSigningRequest(quote);
    const signature = await giverAccount.signTypedData(request.intent);
    expect(await verifyTypedData({ ...request.intent, address: giver, signature })).toBe(true);
    const permitSignature = await giverAccount.signTypedData(request.permit!);

    const submitted = await mock.submitGift({ uuid: quote.quoteId, signature, permitSignature, permitDeadline: Number(request.permit!.message.deadline) });
    expect(submitted.tradeId).toBe(`mock-${quote.quoteId}`);
    expect(submitted.status).toBe("pending");

    const expectation = { payerAddress: quote.giver, inputTokenAddress: quote.from.address, outputTokenAddress: quote.to.address, targetOutputAmountRaw: quote.minOutputRaw };
    expect((await mock.getSettlement(submitted.tradeId, expectation)).state).toBe("pending");
    const settled = await mock.getSettlement(submitted.tradeId, expectation);
    expect(settled).toMatchObject({
      state: "settled",
      paid: { token: quote.from.address, amountRaw: "5000000" },
      received: { token: quote.to.address, amountRaw: "4995000" },
      feesPaid: [{ token: quote.from.address, amountRaw: "500" }],
    });
    expect(settled.txHash).toMatch(/^0x[0-9a-f]{64}$/);

    // The quote is single-use.
    await expect(mock.submitGift({ uuid: quote.quoteId, signature, permitSignature, permitDeadline: quote.deadline })).rejects.toMatchObject({ status: 410, code: "QUOTE_STALE" });
  });

  it("requires the permit signature when the quote asks for one", async () => {
    const mock = createMockSettlement();
    const quote = await mock.quoteGift({ fromToken: "USDC", toToken: "XSGD", fromAmountRaw: "1000000", giver, recipient });
    const error = await mock.submitGift({ uuid: quote.quoteId, signature: "0x1234" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SeraApiError);
    expect((error as SeraApiError).status).toBe(400);
  });

  it("screens the sentinel address as flagged and serves fx rates", async () => {
    const mock = createMockSettlement();
    expect(await mock.screenAddress(MOCK_ADDRESSES.flagged, "giver")).toMatchObject({ state: "flagged", reasons: ["stub_flagged_list"] });
    expect(await mock.screenAddress(giver, "giver")).toMatchObject({ state: "clear", reasons: [] });
    const outage = createMockSettlement({ kytSimulateOutage: true, kytFailClosed: true });
    expect((await outage.screenAddress(giver, "payout")).state).toBe("flagged");
    expect((await mock.fxRate("USD", "SGD")).rate).toBe("1.34");
    expect((await mock.fxRate("sgd", "usd")).rate).toBe("0.74626866");
    expect((await mock.fxRate("USD", "USD")).rate).toBe("1");
    await expect(mock.fxRate("USD", "XYZ")).rejects.toMatchObject({ status: 503 });
  });

  it("exposes a deployment and currency list shaped like the live adapter", async () => {
    const mock = createMockSettlement({ network: "sepolia" });
    const deployment = await mock.getDeployment();
    expect(deployment).toMatchObject({ chainId: 11_155_111, seraAddress: MOCK_ADDRESSES.sera, sorAddress: MOCK_ADDRESSES.sor, health: { healthy: true } });
    const currencies = await mock.listCurrencies();
    expect(currencies.tokens.map((t) => t.symbol)).toEqual(["USDC", "USDT", "XSGD", "MYRT", "EURC"]);
    expect(currencies.markets).toHaveLength(4);
  });
});
