/**
 * Tiny HTML page for the embeddable Give button (iframe target).
 */
import { config } from '../../config.js';
import { escapeXml } from './og.js';

export function embedHtml(cause: { id: number; name: string; stageLabel: string; givenUsd: string }): string {
  const c = config();
  const give = `${c.PUBLIC_WEB_URL}/give/${cause.id}`;
  const name = escapeXml(cause.name);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Give to ${name}</title>
<style>
  html,body{margin:0;background:transparent;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .csd{display:inline-flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:999px;background:#FAF7EE;border:1px solid #E7E2D3;color:#0B1426;text-decoration:none;max-width:100%;box-sizing:border-box}
  .csd b{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
  .csd small{display:block;font-size:11px;color:#4B5563;font-weight:400}
  .csd .btn{background:#00D26A;color:#0B1426;font-weight:700;font-size:14px;padding:8px 14px;border-radius:999px;white-space:nowrap}
  .csd:hover .btn{background:#00b85c}
  .csd .logo{width:22px;height:22px;border-radius:6px;background:#00D26A;display:inline-block}
</style></head>
<body><a class="csd" href="${give}" target="_top" rel="noopener">
  <span class="logo" aria-hidden="true"></span>
  <span><b>${name}</b><small>${escapeXml(cause.stageLabel)} · US$${escapeXml(Number(cause.givenUsd).toLocaleString('en-GB', { maximumFractionDigits: 0 }))} given · causes.sera.cx</small></span>
  <span class="btn">Give</span>
</a></body></html>`;
}

/** The snippet the dashboard shows creators. */
export function embedSnippet(causeId: number): { iframe: string; script: string } {
  const c = config();
  const src = `${c.PUBLIC_API_URL}/api/v1/embed/give/${causeId}`;
  return {
    iframe: `<iframe src="${src}" title="Give on causes.sera.cx" width="360" height="64" style="border:0;overflow:hidden" loading="lazy"></iframe>`,
    script: `<div data-sera-give="${causeId}"></div><script async src="${c.PUBLIC_API_URL}/embed.js"></script>`,
  };
}
