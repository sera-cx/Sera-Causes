/* Which sign-in a build gets, and what the read-only fallback refuses to do. */
import { describe, expect, it } from "vitest";
import { AUTH_MODE, NO_SIGN_IN_NOTE, SignInUnavailableError, fallbackAdapter, mockAdapter, readOnlyAdapter, selectAuthMode, shortAddress } from "@/lib/auth";

describe("selectAuthMode", () => {
  it("picks Privy whenever an app id is configured", () => {
    expect(selectAuthMode({ privyAppId: "clabc123", dev: false })).toBe("privy");
    expect(selectAuthMode({ privyAppId: "clabc123", dev: true })).toBe("privy");
  });

  it("picks the demo wallet only in a dev build", () => {
    expect(selectAuthMode({ privyAppId: undefined, dev: true })).toBe("mock");
    expect(selectAuthMode({ privyAppId: "", dev: true })).toBe("mock");
    expect(selectAuthMode({ privyAppId: "   ", dev: true })).toBe("mock");
  });

  it("never reaches the dev signer in a production build without Privy", () => {
    expect(selectAuthMode({ privyAppId: undefined, dev: false })).toBe("readonly");
    expect(selectAuthMode({ privyAppId: "", dev: false })).toBe("readonly");
    expect(selectAuthMode({ privyAppId: null, dev: false })).toBe("readonly");
  });

  it("is what this build resolved to: a dev build with no app id runs on the demo wallet", () => {
    expect(AUTH_MODE).toBe("mock");
    expect(fallbackAdapter).toBe(mockAdapter);
    expect(fallbackAdapter.mode).toBe("mock");
  });
});

describe("read-only adapter", () => {
  it("has nothing to restore", async () => {
    await expect(readOnlyAdapter.restore()).resolves.toBeNull();
  });

  it("refuses to sign in and to sign, with the note the UI shows", async () => {
    await expect(readOnlyAdapter.signIn()).rejects.toBeInstanceOf(SignInUnavailableError);
    await expect(readOnlyAdapter.signIn()).rejects.toThrow(NO_SIGN_IN_NOTE);
    await expect(readOnlyAdapter.signTypedData({ domain: {}, types: {}, primaryType: "Path", message: {} })).rejects.toBeInstanceOf(SignInUnavailableError);
  });

  it("offers no bearer token", () => {
    expect(readOnlyAdapter.getAccessToken).toBeUndefined();
    expect(mockAdapter.getAccessToken).toBeUndefined();
  });
});

describe("shortAddress", () => {
  it("keeps the first six and last four characters", () => {
    expect(shortAddress("0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc")).toBe("0x95ce…6ebc");
  });
});
