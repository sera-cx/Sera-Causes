/**
 * Privy sign-in, the real thing, against Sera.cx's existing Privy app.
 *
 * Same shape as community.sera.cx's client/src/lib/privy.tsx: the provider is
 * guarded on VITE_PRIVY_APP_ID, so with no app id this module renders the
 * read-only fallback and the site behaves exactly as it does with no Privy at
 * all. ../auth loads this module lazily and only when `privyEnabled`, so an
 * unconfigured build never downloads the SDK.
 *
 * Identity: Privy is the account; the linked Ethereum wallet is the identity
 * the API records. The access token goes out as `Authorization: Bearer` and
 * the API re-resolves the linked wallet from Privy before it trusts any
 * signature, so the browser cannot name a wallet it does not own.
 *
 * Signing: every signed write goes through the connected wallet's EIP-1193
 * provider with `eth_signTypedData_v4`, which covers embedded and external
 * wallets alike. The domain and types come from @sera-causes/shared, built in
 * ../api from VITE_CHAIN_ID and VITE_REGISTRY_ADDRESS.
 */
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useMemo, useRef, type ReactNode } from "react";
import { mainnet, sepolia } from "viem/chains";
import type { Address, Hex } from "@sera-causes/shared";
import { AuthProvider, fallbackAdapter, shortAddress, type AuthAdapter, type AuthSession } from "./auth";
import { CHAIN_ID } from "./env";
import type { TypedDataLike } from "./types";

/**
 * The chain the EIP-712 domain names, so a wallet asked to sign is already on
 * it. Wallets refuse typed data whose domain chain is not the active one.
 */
const CHAIN = CHAIN_ID === mainnet.id ? mainnet : CHAIN_ID === sepolia.id ? sepolia : undefined;

export const PRIVY_APP_ID: string | undefined = import.meta.env.VITE_PRIVY_APP_ID?.trim() || undefined;
export const privyEnabled: boolean = Boolean(PRIVY_APP_ID);

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Domain fields in EIP-712 order. `eth_signTypedData_v4` wants them declared. */
const EIP712_DOMAIN_FIELDS = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "salt", type: "bytes32" },
] as const;

const plain = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));

/**
 * The typed data as the JSON string `eth_signTypedData_v4` takes: bigints as
 * decimal strings, and an EIP712Domain entry covering exactly the domain
 * fields present.
 */
export function toSignTypedDataJson(data: TypedDataLike): string {
  const domain = data.domain;
  return JSON.stringify({
    domain: plain(domain),
    types: { EIP712Domain: EIP712_DOMAIN_FIELDS.filter((f) => domain[f.name] !== undefined), ...data.types },
    primaryType: data.primaryType,
    message: plain(data.message),
  });
}

/**
 * The Ethereum wallet Privy has linked to the account, from the user's linked
 * accounts. Mirrors `extractIdentity()` in community.sera.cx's
 * server/privyAuth.ts, narrowed to the one field this app needs.
 */
export function extractIdentity(accounts: ReadonlyArray<Record<string, unknown> | null | undefined>): { walletAddress: Address | null; walletAddresses: Address[] } {
  const byType = (t: string) => accounts.find((a) => a?.type === t);
  const clean = (v: unknown) => (typeof v === "string" && ADDRESS.test(v) ? (v.toLowerCase() as Address) : null);
  const raw = clean(byType("wallet")?.address) ?? clean(byType("smart_wallet")?.address);
  const all = accounts.filter((a) => a?.type === "wallet" || a?.type === "smart_wallet").map((a) => clean(a?.address));
  return { walletAddress: raw, walletAddresses: [...new Set(all.filter((a): a is Address => a !== null))] };
}

/** Turns Privy's hook state into the `AuthAdapter` and `AuthSession` that ../auth expects. */
function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  const linked = useMemo(() => extractIdentity((user?.linkedAccounts ?? []) as unknown as Array<Record<string, unknown>>), [user]);

  /**
   * The wallet acting for this account. A wallet that is both linked to the
   * Privy account and connected in this browser can sign and will be accepted
   * by the API; anything else is a fallback the API may refuse, which is the
   * right answer rather than silently acting as the wrong wallet.
   */
  const wallet = useMemo<Address | null>(() => {
    if (!authenticated) return null;
    const connected = wallets.map((w) => w.address.toLowerCase() as Address);
    const picked = connected.find((a) => a === linked.walletAddress) ?? connected.find((a) => linked.walletAddresses.includes(a)) ?? linked.walletAddress ?? connected[0];
    return picked && ADDRESS.test(picked) ? picked : null;
  }, [authenticated, wallets, linked]);

  // The adapter is stable so AuthProvider's effects do not churn; it reads the
  // current hook values through this ref.
  const live = useRef({ wallets, wallet, login, logout, getAccessToken });
  live.current = { wallets, wallet, login, logout, getAccessToken };

  const adapter = useMemo<AuthAdapter>(
    () => ({
      mode: "privy",
      // Privy restores its own session and reports it through `session` below.
      async restore() {
        return null;
      },
      async signIn() {
        live.current.login();
        return null;
      },
      async signOut() {
        await live.current.logout();
      },
      getAccessToken: () => live.current.getAccessToken(),
      async signTypedData(data) {
        const addr = live.current.wallet;
        if (!addr) throw new Error("Connect a wallet to sign this.");
        const w = live.current.wallets.find((x) => x.address.toLowerCase() === addr);
        if (!w) throw new Error("Your wallet is not connected in this browser. Connect it and try again.");
        const provider = await w.getEthereumProvider();
        const signature: unknown = await provider.request({ method: "eth_signTypedData_v4", params: [w.address, toSignTypedDataJson(data)] });
        if (typeof signature !== "string") throw new Error("The wallet did not return a signature.");
        return signature as Hex;
      },
    }),
    [],
  );

  const session = useMemo<AuthSession>(
    () => ({
      user: wallet ? { wallet, displayName: shortAddress(wallet) } : null,
      ready: ready && (!authenticated || walletsReady),
      busy: !ready,
    }),
    [wallet, ready, authenticated, walletsReady],
  );

  return (
    <AuthProvider adapter={adapter} session={session}>
      {children}
    </AuthProvider>
  );
}

/**
 * Guarded provider. With no app id it is the read-only fallback, so importing
 * this module can never break a build that has no Privy app configured.
 */
export default function PrivyAuthProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <AuthProvider adapter={fallbackAdapter}>{children}</AuthProvider>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Wallet first, with email and Google for people who have no wallet
        // yet; each still has to be enabled in the Privy dashboard.
        loginMethods: ["wallet", "email", "google"],
        // Ethereum only. "ethereum-and-solana" drags the whole Solana wallet
        // stack into the bundle for no gain here.
        appearance: { theme: "light", walletChainType: "ethereum-only" },
        // Everyone needs a wallet that can produce an EIP-712 signature, so
        // accounts that sign in with email or Google get an embedded one.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        ...(CHAIN ? { defaultChain: CHAIN, supportedChains: [CHAIN] } : {}),
      }}
    >
      <PrivyAuthBridge>{children}</PrivyAuthBridge>
    </PrivyProvider>
  );
}
