/**
 * Email outbox: sends pending rows through Resend when RESEND_API_KEY is set;
 * otherwise logs them and marks them `logged`.
 */
import { db } from '../db.js';
import { config } from '../config.js';
import { logger } from '../log.js';

export async function sendOutboxOnce(opts: { fetchImpl?: typeof fetch; limit?: number } = {}): Promise<{ sent: number; logged: number; failed: number }> {
  const c = config();
  const f = opts.fetchImpl ?? fetch;
  const rows = await db().emailOutbox.findMany({ where: { state: 'pending', attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, take: opts.limit ?? 50 });
  let sent = 0;
  let logged = 0;
  let failed = 0;
  for (const m of rows) {
    if (!c.RESEND_API_KEY) {
      logger.info({ to: m.to, subject: m.subject }, 'email (no RESEND_API_KEY, logged only)');
      await db().emailOutbox.update({ where: { id: m.id }, data: { state: 'logged', sentAt: new Date(), attempts: { increment: 1 } } });
      logged += 1;
      continue;
    }
    try {
      const res = await f('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${c.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: c.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      await db().emailOutbox.update({ where: { id: m.id }, data: { state: 'sent', sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
      sent += 1;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.warn({ err, id: m.id }, 'email send failed');
      await db().emailOutbox.update({ where: { id: m.id }, data: { attempts: { increment: 1 }, lastError: error, ...(m.attempts + 1 >= 5 ? { state: 'failed' } : {}) } });
      failed += 1;
    }
  }
  return { sent, logged, failed };
}
