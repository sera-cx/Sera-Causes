/**
 * Sign-in. Mock mode until a Privy app exists for causes.sera.cx.
 *
 * Structure: an `AuthAdapter` does the wallet work; `AuthProvider` exposes a
 * stable hook. To drop Privy in, add a `PrivyAdapter` that wraps
 * `@privy-io/react-auth` (usePrivy, useWallets, signTypedData) and pick it
 * when VITE_PRIVY_APP_ID is set. Pages only ever use `useAuth()`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setApiWallet } from "./api";
import { DEMO_WALLET } from "./mock/state";

export interface AuthUser {
  wallet: string;
  displayName: string;
}

export interface AuthAdapter {
  readonly mode: "mock" | "privy";
  /** Restore a previous session, if any. */
  restore(): Promise<AuthUser | null>;
  signIn(): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** EIP-712 signing for paths, votes, challenges and the homepage toggle. */
  signTypedData(payload: unknown): Promise<string>;
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

/** Signs you in as the demo wallet that owns cause 1 (Kasih) and cause 14. */
export const mockAdapter: AuthAdapter = {
  mode: "mock",
  async restore() {
    return readStorage() ? { wallet: DEMO_WALLET, displayName: "Demo wallet" } : null;
  },
  async signIn() {
    await new Promise((r) => setTimeout(r, 350));
    writeStorage(true);
    return { wallet: DEMO_WALLET, displayName: "Demo wallet" };
  },
  async signOut() {
    writeStorage(false);
  },
  async signTypedData(payload) {
    // Deterministic fake signature so the mock API can store it alongside the body.
    const text = JSON.stringify(payload);
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return `0xmock${h.toString(16).padStart(8, "0")}`;
  },
};

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  busy: boolean;
  mode: AuthAdapter["mode"];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signTypedData: (payload: unknown) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ adapter = mockAdapter, children }: { adapter?: AuthAdapter; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adapter.restore().then((u) => {
      if (cancelled) return;
      setUser(u);
      setApiWallet(u?.wallet ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      const u = await adapter.signIn();
      setUser(u);
      setApiWallet(u.wallet);
    } finally {
      setBusy(false);
    }
  }, [adapter]);

  const signOut = useCallback(async () => {
    await adapter.signOut();
    setUser(null);
    setApiWallet(null);
  }, [adapter]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, busy, mode: adapter.mode, signIn, signOut, signTypedData: adapter.signTypedData }),
    [user, ready, busy, adapter, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
