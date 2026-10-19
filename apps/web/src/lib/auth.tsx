/**
 * Sign-in. Mock mode until a Privy app exists for causes.sera.cx.
 *
 * Structure: an `AuthAdapter` does the wallet work; `AuthProvider` exposes a
 * stable hook and hands the API client a signer. To drop Privy in, add a
 * `PrivyAdapter` that wraps `@privy-io/react-auth` (usePrivy, useWallets,
 * signTypedData) and pick it when VITE_PRIVY_APP_ID is set. Pages only ever
 * use `useAuth()`.
 *
 * The mock adapter signs for real with the dev key in ./devWallet, so the
 * EIP-712 signatures verify on the API when it runs with `X-Dev-Wallet`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Address, Hex } from "@sera-causes/shared";
import { setApiSigner, setApiWallet } from "./api";
import { DEMO_WALLET, devAccount } from "./devWallet";
import type { TypedDataLike } from "./types";

export interface AuthUser {
  wallet: Address;
  displayName: string;
}

export interface AuthAdapter {
  readonly mode: "mock" | "privy";
  /** Restore a previous session, if any. */
  restore(): Promise<AuthUser | null>;
  signIn(): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** EIP-712 signing for paths, votes, challenges, the homepage toggle and Sera.cx intents. */
  signTypedData(data: TypedDataLike): Promise<Hex>;
}

const STORAGE_KEY = "csd.auth.mock";

function readStorage(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeStorage(signedIn: boolean) {
  try {
    if (typeof window === "undefined") return;
    if (signedIn) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode or blocked storage */
  }
}

const DEMO_USER: AuthUser = { wallet: DEMO_WALLET, displayName: "Demo wallet" };

/** Signs you in as the demo wallet that owns cause 1 (Kasih) and cause 14 (Free Tree Society). */
export const mockAdapter: AuthAdapter = {
  mode: "mock",
  async restore() {
    return readStorage() ? DEMO_USER : null;
  },
  async signIn() {
    await new Promise((r) => setTimeout(r, 350));
    writeStorage(true);
    return DEMO_USER;
  },
  async signOut() {
    writeStorage(false);
  },
  async signTypedData(data) {
    // A real secp256k1 signature from the dev key, so verifyTypedData on the API passes.
    return devAccount.signTypedData(data as unknown as Parameters<typeof devAccount.signTypedData>[0]);
  },
};

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  busy: boolean;
  mode: AuthAdapter["mode"];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signTypedData: (data: TypedDataLike) => Promise<Hex>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ adapter = mockAdapter, children }: { adapter?: AuthAdapter; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (u: AuthUser | null) => {
      setUser(u);
      setApiWallet(u?.wallet ?? null);
      setApiSigner(u ? { wallet: u.wallet, signTypedData: (d) => adapter.signTypedData(d) } : null);
    },
    [adapter],
  );

  useEffect(() => {
    let cancelled = false;
    adapter.restore().then((u) => {
      if (cancelled) return;
      apply(u);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, apply]);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      apply(await adapter.signIn());
    } finally {
      setBusy(false);
    }
  }, [adapter, apply]);

  const signOut = useCallback(async () => {
    await adapter.signOut();
    apply(null);
  }, [adapter, apply]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, busy, mode: adapter.mode, signIn, signOut, signTypedData: (d) => adapter.signTypedData(d) }),
    [user, ready, busy, adapter, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** True when `address` is the signed-in wallet. Safe outside the provider (returns false). */
export function useIsMe(address: string | null | undefined): boolean {
  const ctx = useContext(AuthContext);
  return !!address && !!ctx?.user && ctx.user.wallet.toLowerCase() === address.toLowerCase();
}
