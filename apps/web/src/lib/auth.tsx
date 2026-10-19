/**
 * Sign-in. Three adapters behind one `useAuth()`:
 *
 *   privy    real sign-in through Sera.cx's Privy app. Picked whenever
 *            VITE_PRIVY_APP_ID is set. Lives in ./privy, loaded on demand so a
 *            site without Privy never downloads the SDK.
 *   mock     the demo wallet, signing for real with the local test account
 *            ./devWallet derives, so EIP-712 signatures verify against
 *            `X-Dev-Wallet` on the API. Dev builds only, and no private key
 *            is committed for it.
 *   readonly no account at all. What a production build falls back to when
 *            Privy is not configured: reads work, writes are not offered, and
 *            the dev signer is never reachable.
 *
 * `selectAuthMode` is the whole of that decision and is tested directly.
 * Pages only ever use `useAuth()`.
 */
import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Address, Hex } from "@sera-causes/shared";
import { setApiSigner } from "./api";
import type { TypedDataLike } from "./types";

export interface AuthUser {
  wallet: Address;
  displayName: string;
}

export type AuthMode = "mock" | "privy" | "readonly";

export interface AuthAdapter {
  readonly mode: AuthMode;
  /** Restore a previous session, if any. Ignored when the adapter drives `session` itself. */
  restore(): Promise<AuthUser | null>;
  /** Starts sign-in. May return null when the adapter reports the result through `session` instead. */
  signIn(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  /** EIP-712 signing for paths, votes, challenges, the homepage toggle and Sera.cx intents. */
  signTypedData(data: TypedDataLike): Promise<Hex>;
  /** The bearer token the API authenticates with. Privy only. */
  getAccessToken?: () => Promise<string | null>;
}

/** Session state an adapter owns itself, instead of leaving it to `AuthProvider`. */
export interface AuthSession {
  user: AuthUser | null;
  ready: boolean;
  busy: boolean;
}

/** Shown wherever an action needs an account and this site has no sign-in. */
export const NO_SIGN_IN_NOTE = "Sign-in is not configured on this site, so it is read-only for now.";

export const PRIVY_APP_ID: string | undefined = import.meta.env.VITE_PRIVY_APP_ID?.trim() || undefined;

/**
 * Privy when it is configured, the demo wallet in a dev build, nothing
 * otherwise. A production build with no Privy app never gets the dev signer.
 */
export function selectAuthMode(env: { privyAppId?: string | null; dev: boolean }): AuthMode {
  if (env.privyAppId && env.privyAppId.trim()) return "privy";
  return env.dev ? "mock" : "readonly";
}

export const AUTH_MODE: AuthMode = selectAuthMode({ privyAppId: PRIVY_APP_ID, dev: import.meta.env.DEV });

export const shortAddress = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---------------------------------------------------------------------------
// Mock adapter (dev builds only)
// ---------------------------------------------------------------------------

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

/**
 * The local test signer, loaded only here and only in a dev build. Vite folds
 * `import.meta.env.DEV` to `false` in a production build and drops the branch
 * with its chunk, and `vite.config.ts` aliases the module away as well.
 */
async function devSigner() {
  if (!import.meta.env.DEV) throw new Error("the development signer is not available in a production build");
  const { devAccount, DEMO_WALLET } = await import("./devWallet");
  return { devAccount, DEMO_WALLET };
}

/** Signs you in as the demo wallet that owns cause 1 (Kasih) and cause 14 (Free Tree Society). */
export const mockAdapter: AuthAdapter = {
  mode: "mock",
  async restore() {
    if (!readStorage()) return null;
    const { DEMO_WALLET } = await devSigner();
    return { wallet: DEMO_WALLET, displayName: "Demo wallet" };
  },
  async signIn() {
    const { DEMO_WALLET } = await devSigner();
    await new Promise((r) => setTimeout(r, 350));
    writeStorage(true);
    return { wallet: DEMO_WALLET, displayName: "Demo wallet" };
  },
  async signOut() {
    writeStorage(false);
  },
  async signTypedData(data) {
    // A real secp256k1 signature from the local test account, so verifyTypedData on the API passes.
    const { devAccount } = await devSigner();
    return devAccount.signTypedData(data as unknown as Parameters<typeof devAccount.signTypedData>[0]);
  },
};

// ---------------------------------------------------------------------------
// Read-only adapter
// ---------------------------------------------------------------------------

export class SignInUnavailableError extends Error {
  constructor() {
    super(NO_SIGN_IN_NOTE);
    this.name = "SignInUnavailableError";
  }
}

export const readOnlyAdapter: AuthAdapter = {
  mode: "readonly",
  async restore() {
    return null;
  },
  async signIn() {
    throw new SignInUnavailableError();
  },
  async signOut() {
    /* nothing to clear */
  },
  async signTypedData() {
    throw new SignInUnavailableError();
  },
};

/** The adapter used when Privy is not configured. */
export const fallbackAdapter: AuthAdapter = AUTH_MODE === "mock" ? mockAdapter : readOnlyAdapter;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  busy: boolean;
  mode: AuthMode;
  /** False when this site has no sign-in; the nav and action prompts hide themselves. */
  canSignIn: boolean;
  /** One line explaining why an action needing an account is unavailable, or null. */
  unavailableReason: string | null;
  /** The last sign-in or sign-out failure, cleared on the next attempt. */
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signTypedData: (data: TypedDataLike) => Promise<Hex>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ adapter = fallbackAdapter, session, children }: { adapter?: AuthAdapter; session?: AuthSession; children: ReactNode }) {
  const [own, setOwn] = useState<AuthSession>({ user: null, ready: false, busy: false });
  const [error, setError] = useState<string | null>(null);
  const controlled = session !== undefined;
  const state = session ?? own;

  // Restore a previous session, unless the adapter reports one itself.
  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    adapter
      .restore()
      .catch(() => null)
      .then((u) => {
        if (!cancelled) setOwn({ user: u, ready: true, busy: false });
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, controlled]);

  // Keep the API client's credentials in step with whoever is signed in. This
  // has to happen during render, not in an effect: queries are enabled the
  // moment `user` appears, and a child's effect runs before the parent's, so
  // an effect here would let the first authenticated request go out before the
  // client had any credentials. The ref makes it idempotent.
  const applied = useRef<string | null>(null);
  const credentials = state.user ? `${adapter.mode}:${state.user.wallet}` : "";
  if (applied.current !== credentials) {
    applied.current = credentials;
    const u = state.user;
    setApiSigner(
      u
        ? {
            wallet: u.wallet,
            signTypedData: (d) => adapter.signTypedData(d),
            ...(adapter.getAccessToken ? { getAccessToken: () => adapter.getAccessToken!() } : {}),
            devWallet: adapter.mode === "mock",
          }
        : null,
    );
  }

  const signIn = useCallback(async () => {
    setError(null);
    if (!controlled) setOwn((s) => ({ ...s, busy: true }));
    try {
      const u = await adapter.signIn();
      if (!controlled) setOwn({ user: u, ready: true, busy: false });
    } catch (e) {
      if (!controlled) setOwn((s) => ({ ...s, busy: false }));
      setError(e instanceof Error ? e.message : "Sign-in did not complete.");
    }
  }, [adapter, controlled]);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await adapter.signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-out did not complete.");
    }
    if (!controlled) setOwn({ user: null, ready: true, busy: false });
  }, [adapter, controlled]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      ready: state.ready,
      busy: state.busy,
      mode: adapter.mode,
      canSignIn: adapter.mode !== "readonly",
      unavailableReason: adapter.mode === "readonly" ? NO_SIGN_IN_NOTE : null,
      error,
      signIn,
      signOut,
      signTypedData: (d) => adapter.signTypedData(d),
    }),
    [state, adapter, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Privy's provider, its SDK and its adapter, in a chunk of their own. Only
 * fetched when VITE_PRIVY_APP_ID is set.
 */
const PrivyAuthProvider = lazy(() => import("./privy"));

/** Wraps the app in whichever sign-in this build has. Used once, in main.tsx. */
export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (AUTH_MODE !== "privy") return <AuthProvider adapter={fallbackAdapter}>{children}</AuthProvider>;
  return (
    <Suspense fallback={null}>
      <PrivyAuthProvider>{children}</PrivyAuthProvider>
    </Suspense>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** The one-line read-only note, or null when this site has sign-in. Safe outside the provider. */
export function useSignInNote(): string | null {
  const ctx = useContext(AuthContext);
  return ctx?.unavailableReason ?? null;
}

/** True when `address` is the signed-in wallet. Safe outside the provider (returns false). */
export function useIsMe(address: string | null | undefined): boolean {
  const ctx = useContext(AuthContext);
  return !!address && !!ctx?.user && ctx.user.wallet.toLowerCase() === address.toLowerCase();
}
