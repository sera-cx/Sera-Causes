import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { ClaimCode } from "./constants";
import type { CauseFilters, ClaimTab, LeaderboardBoard, LeaderboardPeriod } from "./types";
import { useAuth } from "./auth";

export const keys = {
  stats: ["stats"] as const,
  home: ["home"] as const,
  causes: (f: CauseFilters) => ["causes", f] as const,
  cause: (id: number) => ["cause", id] as const,
  record: (id: number) => ["record", id] as const,
  claims: (tab: ClaimTab) => ["claims", tab] as const,
  claim: (causeId: number, claim: ClaimCode) => ["claim", causeId, claim] as const,
  me: ["me"] as const,
  leaderboards: (b: LeaderboardBoard, p: LeaderboardPeriod) => ["leaderboards", b, p] as const,
  dashboard: ["dashboard"] as const,
};

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: api.getStats });
export const useHome = () => useQuery({ queryKey: keys.home, queryFn: api.getHome });
export const useCauses = (f: CauseFilters) => useQuery({ queryKey: keys.causes(f), queryFn: () => api.listCauses(f) });
export const useCause = (id: number) => useQuery({ queryKey: keys.cause(id), queryFn: () => api.getCause(id), enabled: Number.isFinite(id) && id > 0 });
export const useRecord = (id: number) => useQuery({ queryKey: keys.record(id), queryFn: () => api.getRecord(id), enabled: id > 0 });
export const useClaims = (tab: ClaimTab) => useQuery({ queryKey: keys.claims(tab), queryFn: () => api.listClaims(tab) });
export const useClaim = (causeId: number, claim: ClaimCode) => useQuery({ queryKey: keys.claim(causeId, claim), queryFn: () => api.getClaim(causeId, claim), enabled: causeId > 0 });
export const useLatestEvents = (limit = 12) => useQuery({ queryKey: ["latest-events", limit], queryFn: () => api.getLatestEvents(limit) });
export const useLeaderboards = (b: LeaderboardBoard, p: LeaderboardPeriod) => useQuery({ queryKey: keys.leaderboards(b, p), queryFn: () => api.getLeaderboards(b, p) });

export function useMe() {
  const { user } = useAuth();
  return useQuery({ queryKey: keys.me, queryFn: api.getMe, enabled: !!user });
}
export function useDashboard() {
  const { user } = useAuth();
  return useQuery({ queryKey: keys.dashboard, queryFn: api.getDashboard, enabled: !!user });
}

/** Invalidate everything that could have changed after a write. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}
