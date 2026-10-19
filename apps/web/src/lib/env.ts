/**
 * Build-time settings. With VITE_API_URL unset every call is served by the
 * mock layer; with it set, calls go to `${VITE_API_URL}/api/v1`.
 */
import type { Address } from "@sera-causes/shared";

export const API_URL: string | undefined = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || undefined;
export const USING_MOCK = !API_URL;

/** EIP-712 domain for signed writes. Must match the API's CHAIN_ID and REGISTRY_ADDRESS. */
export const CHAIN_ID: number = Number(import.meta.env.VITE_CHAIN_ID ?? "11155111") || 11155111;
export const REGISTRY_ADDRESS: Address = ((import.meta.env.VITE_REGISTRY_ADDRESS ?? "").trim().toLowerCase() || "0x0000000000000000000000000000000000000000") as Address;
