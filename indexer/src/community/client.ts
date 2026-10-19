/**
 * community.sera.cx client (docs/PLAN.md section 7).
 *
 * Helpers earn Care XP on community.sera.cx, not gSera. The partner route does
 * not exist yet, so every event is written to the `XpEvent` table and left
 * `queued`. Nothing is sent anywhere until the community team agrees the XP
 * amounts and the route.
 *
 * TODO: when the route lands, add a `live` implementation that posts each
 * queued event to `POST /api/partner/xp` on `COMMUNITY_BASE_URL`, signed with
 * an `X-Sera-Signature` HMAC over the raw body using `COMMUNITY_HMAC_KEY` (the
 * same scheme as the gSera partner calls in packages/gsera-client). It then
 * marks the row `sent` with `sentAt`, or `unmatched` when community.sera.cx
 * has no member for that wallet. Switch with `COMMUNITY_MODE=live`.
 */
import type { XpEvent, XpEventType } from '@sera-causes/shared';
import { config } from '../config.js';
import { logger } from '../log.js';

/** What community.sera.cx knows about a wallet. */
export interface CommunityMember {
  wallet: string;
  /** Member handle on community.sera.cx, when the wallet is linked to one. */
  handle: string | null;
  /** Total Care XP held there. Null while the route is unavailable. */
  careXp: number | null;
  linked: boolean;
}

/** One event as it goes over the wire to community.sera.cx. */
export interface XpAward {
  wallet: string;
  eventType: XpEventType;
  xp: number;
  sourceRef: string;
  causeId?: number | null;
  proofUrl?: string | null;
  createdAt: string;
}

export interface AwardResult {
  state: XpEvent['state'];
  /** Id community.sera.cx gave the award, once the route exists. */
  awardId?: string;
}

export interface CommunityClient {
  readonly mode: 'queue' | 'live';
  /** Records one Care XP event for a wallet. */
  awardXp(event: XpAward): Promise<AwardResult>;
  /** Looks a wallet up on community.sera.cx. */
  getMember(wallet: string): Promise<CommunityMember>;
}

/**
 * Queue-only client: it marks the event `queued` and logs it. The row stays in
 * the `XpEvent` table until the partner route exists and a `live` client can
 * push it.
 */
export function createQueueCommunityClient(): CommunityClient {
  return {
    mode: 'queue',
    async awardXp(event) {
      logger.info(
        { wallet: event.wallet, eventType: event.eventType, xp: event.xp, sourceRef: event.sourceRef, causeId: event.causeId ?? null },
        'Care XP queued for community.sera.cx',
      );
      return { state: 'queued' };
    },
    async getMember(wallet) {
      return { wallet: wallet.toLowerCase(), handle: null, careXp: null, linked: false };
    },
  };
}

let cached: CommunityClient | undefined;

/** Process-wide community client, built from `COMMUNITY_MODE` (default `queue`). */
export function getCommunity(): CommunityClient {
  if (!cached) {
    const mode = config().COMMUNITY_MODE;
    if (mode === 'live') {
      // The route is not agreed yet, so live mode still queues. See the TODO above.
      logger.warn({ baseUrl: config().COMMUNITY_BASE_URL }, 'COMMUNITY_MODE=live but POST /api/partner/xp is not agreed yet; queueing instead');
    }
    cached = createQueueCommunityClient();
  }
  return cached;
}

export function setCommunityForTests(client: CommunityClient | undefined): void {
  cached = client;
}
