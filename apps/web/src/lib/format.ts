const usd0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function fmtUsd(n: number, opts: { cents?: boolean } = {}): string {
  return `US$${opts.cents ? usd2.format(n) : usd0.format(n)}`;
}

export function fmtInt(n: number): string {
  return int.format(n);
}

export function fmtGsera(n: number): string {
  return `${int.format(n)} gSera`;
}

/** XP on community.sera.cx. A standing, never a balance. */
export function fmtXp(n: number): string {
  return `${int.format(n)} XP`;
}

export function fmtCompactUsd(n: number): string {
  if (n >= 1_000_000) return `US$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `US$${(n / 1000).toFixed(1)}k`;
  return fmtUsd(n);
}

export function fmtDate(iso: string | Date, withTime = false): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (!withTime) return date;
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function fmtMultiplier(n: number): string {
  return `${Number.isInteger(n) ? n.toFixed(1) : String(n)}x`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} month${mo === 1 ? "" : "s"} ago`;
}

export function timeLeft(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "closed";
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))} min left`;
  if (h < 48) return `${h} h left`;
  return `${Math.floor(h / 24)} days left`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${int.format(n)} ${n === 1 ? one : many}`;
}
