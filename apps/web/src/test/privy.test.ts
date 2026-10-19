/* The two pure pieces of the Privy adapter: the wallet it reads out of a Privy
   account, and the payload it hands eth_signTypedData_v4. */
import { describe, expect, it } from "vitest";
import { PRIVY_APP_ID, extractIdentity, privyEnabled, toSignTypedDataJson } from "@/lib/privy";

describe("extractIdentity", () => {
  it("takes the address from the linked wallet account", () => {
    expect(extractIdentity([{ type: "email", address: "a@b.co" }, { type: "wallet", address: "0x95CED938F7991CD0DFCB48F0A06A40FA1AF46EBC" }]).walletAddress).toBe("0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc");
  });

  it("falls back to a smart wallet and ignores anything that is not an address", () => {
    expect(extractIdentity([{ type: "smart_wallet", address: "0x22D491Bde2303F2F43325B2108D26F1EABA1E32B" }]).walletAddress).toBe("0x22d491bde2303f2f43325b2108d26f1eaba1e32b");
    expect(extractIdentity([{ type: "wallet", address: "not-an-address" }]).walletAddress).toBeNull();
    expect(extractIdentity([{ type: "google_oauth", email: "a@b.co" }]).walletAddress).toBeNull();
    expect(extractIdentity([]).walletAddress).toBeNull();
    expect(extractIdentity([]).walletAddresses).toEqual([]);
  });

  it("lists every linked wallet, deduplicated, so a second one can still act", () => {
    const id = extractIdentity([
      { type: "wallet", address: "0x95CED938F7991CD0DFCB48F0A06A40FA1AF46EBC" },
      { type: "wallet", address: "0x22d491bde2303f2f43325b2108d26f1eaba1e32b" },
      { type: "wallet", address: "0x22D491BDE2303F2F43325B2108D26F1EABA1E32B" },
      { type: "wallet", address: "nonsense" },
    ]);
    expect(id.walletAddresses).toEqual(["0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc", "0x22d491bde2303f2f43325b2108d26f1eaba1e32b"]);
    expect(id.walletAddress).toBe("0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc");
  });
});

describe("toSignTypedDataJson", () => {
  const data = {
    domain: { name: "Sera Causes", version: "1", chainId: 11155111, verifyingContract: "0x5fbdb2315678afecb367f032d93f642f64180aa3" },
    types: { Path: [{ name: "causeId", type: "uint256" }, { name: "checkedAt", type: "uint64" }] },
    primaryType: "Path",
    message: { causeId: 14n, checkedAt: 1760000000n },
  };

  it("declares the domain fields present, in EIP-712 order", () => {
    const parsed = JSON.parse(toSignTypedDataJson(data)) as { types: Record<string, { name: string }[]> };
    expect(parsed.types.EIP712Domain!.map((f) => f.name)).toEqual(["name", "version", "chainId", "verifyingContract"]);
    expect(parsed.types.Path).toHaveLength(2);
  });

  it("writes bigints as decimal strings so the payload survives JSON", () => {
    const parsed = JSON.parse(toSignTypedDataJson(data)) as { message: Record<string, unknown>; primaryType: string };
    expect(parsed.message).toEqual({ causeId: "14", checkedAt: "1760000000" });
    expect(parsed.primaryType).toBe("Path");
  });
});

describe("the guard", () => {
  it("reports Privy off when no app id is configured, as in this test build", () => {
    expect(PRIVY_APP_ID).toBeUndefined();
    expect(privyEnabled).toBe(false);
  });
});
