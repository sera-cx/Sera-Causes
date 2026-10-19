/**
 * In-app notifications (brief 14) as Notification rows, plus an EmailOutbox row
 * when the wallet has an email on file and the event is one givers get by email.
 */
import { db } from './db.js';
import { config } from './config.js';

export type NotificationKind =
  | 'cause_verified'
  | 'cause_paused'
  | 'refunds_open'
  | 'claim_finalised'
  | 'claim_challenged'
  | 'gsera_credited'
  | 'help_confirmed'
  | 'challenge_resolved';

export interface NotifyInput {
  wallet: string;
  kind: NotificationKind;
  title: string;
  body: string;
  causeId?: number | null;
  data?: Record<string, unknown>;
  /** Also queue an email when the wallet has one on file. */
  email?: boolean;
}

export async function notify(input: NotifyInput): Promise<void> {
  const wallet = input.wallet.toLowerCase();
  await db().notification.create({
    data: {
      wallet,
      kind: input.kind,
      title: input.title,
      body: input.body,
      causeId: input.causeId ?? null,
      data: input.data ? (JSON.parse(JSON.stringify(input.data)) as object) : undefined,
    },
  });
  if (input.email) {
    const w = await db().wallet.findUnique({ where: { address: wallet } });
    if (w?.email) {
      const link = input.causeId ? `${config().PUBLIC_WEB_URL}/c/${input.causeId}` : config().PUBLIC_WEB_URL;
      await db().emailOutbox.create({
        data: {
          to: w.email,
          subject: input.title,
          text: `${input.body}\n\n${link}\n\nCare Share Donate, causes.sera.cx`,
        },
      });
    }
  }
}

/** Every distinct sender of a gift to a cause. */
export async function giversOf(causeId: number): Promise<string[]> {
  const rows = await db().gift.findMany({ where: { causeId }, select: { sender: true }, distinct: ['sender'] });
  return rows.map((r) => r.sender);
}

export async function notifyGivers(causeId: number, input: Omit<NotifyInput, 'wallet' | 'causeId'>): Promise<number> {
  const givers = await giversOf(causeId);
  for (const wallet of givers) await notify({ ...input, wallet, causeId });
  return givers.length;
}

/** Helpers who wrote a path and voters on a claim epoch. */
export async function notifyClaimParticipants(
  causeId: number,
  claimType: string,
  epoch: number,
  input: Omit<NotifyInput, 'wallet' | 'causeId'>,
): Promise<number> {
  const [paths, votes] = await Promise.all([
    db().path.findMany({ where: { causeId, claimType, epoch }, select: { author: true } }),
    db().vote.findMany({ where: { causeId, claimType, epoch }, select: { voter: true } }),
  ]);
  const wallets = new Set<string>([...paths.map((p) => p.author), ...votes.map((v) => v.voter)]);
  for (const wallet of wallets) await notify({ ...input, wallet, causeId });
  return wallets.size;
}
