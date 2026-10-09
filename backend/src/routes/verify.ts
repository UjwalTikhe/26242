/**
 * Public certificate verifier landing page.
 *
 * Every certificate QR points at `${PUBLIC_BASE_URL}/verify/<certificateNo>`
 * (see certificate.service.ts) — a human-facing URL, not the JSON API at
 * `/api/v1/verify/:certificateNo`. This module renders a mobile-first page so a
 * phone camera can open the QR result with no separate frontend deploy, while
 * `?format=json` (or `Accept: application/json`) returns the same payload the
 * contract route produces for app/PWA consumers.
 */
import type { Express, Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { verifyCertificate } from '../services/certificate.service.js';

type VerifyResult = Awaited<ReturnType<typeof verifyCertificate>>;

/* ------------------------------ helpers ----------------------------- */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function fmtDate(value?: string | Date): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REASSESS: 'Reassessment requested',
  REVIEWED: 'Reviewed',
  AI_ANALYZED: 'AI analyzed',
};

/* ------------------------------- styles ----------------------------- */

const CSS = `
:root{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--ok:#047857;--ok-bg:#ecfdf5;--warn:#b45309;--warn-bg:#fffbeb;--bad:#b91c1c;--bad-bg:#fef2f2;--brand:#1d4ed8}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari",sans-serif;background:#f8fafc;color:var(--ink);line-height:1.5}
.wrap{max-width:520px;margin:0 auto;padding:20px 16px 48px}
header{display:flex;align-items:center;gap:10px;margin:8px 0 18px}
.logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#1d4ed8,#4f46e5);color:#fff;display:grid;place-items:center;font-weight:700;font-size:15px;letter-spacing:.5px}
.brand small{display:block;color:var(--muted);font-size:12px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.06);overflow:hidden}
.card .body{padding:18px}
.badge{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:14px;padding:7px 12px;border-radius:999px;margin-bottom:14px}
.badge .dot{width:9px;height:9px;border-radius:50%}
.badge.ok{color:var(--ok);background:var(--ok-bg)}.badge.ok .dot{background:var(--ok)}
.badge.warn{color:var(--warn);background:var(--warn-bg)}.badge.warn .dot{background:var(--warn)}
.badge.bad{color:var(--bad);background:var(--bad-bg)}.badge.bad .dot{background:var(--bad)}
h1{font-size:19px;margin:0 0 4px}
.sub{color:var(--muted);font-size:13px;margin:0 0 16px}
.name{font-size:22px;font-weight:700;margin:0 0 2px}
.trade{color:var(--muted);font-size:14px;margin:0 0 16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.stat{background:#f8fafc;border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.stat .k{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.stat .v{font-weight:600;font-size:15px;margin-top:2px}
.row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed var(--line);font-size:14px}
.row:last-child{border-bottom:none}
.row .k{color:var(--muted)}
.row .v{font-weight:600;text-align:right;word-break:break-all}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
.score{font-size:34px;font-weight:800;color:var(--brand);line-height:1}
.footnote{margin-top:16px;color:var(--muted);font-size:12px;text-align:center}
form{display:flex;gap:8px;margin-top:6px}
input{flex:1;min-width:0;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:15px}
button{padding:12px 16px;border:0;border-radius:10px;background:var(--brand);color:#fff;font-weight:600;font-size:15px}
button:active{opacity:.9}
.mock{color:var(--muted);font-size:12px;margin-top:10px}
`;

function shell(title: string, inner: string, extraHead = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>${extraHead}<style>${CSS}</style></head>
<body><div class="wrap">
<header><div class="logo">SIH</div><div class="brand"><strong>Skill India RPL</strong><small>Certificate verification • SIH26242</small></div></header>
${inner}
<p class="footnote">Verified against the assessment record on ${esc(env.PUBLIC_BASE_URL)}. Certificate status can change; re-scan to refresh.</p>
</div></body></html>`;
}

/* ------------------------------- pages ------------------------------ */

function validPage(result: VerifyResult, certificateNo: string): string {
  const cert = result.certificate!;
  const holder = result.holder;
  const asmt = result.assessment;
  const inner = `
<div class="card"><div class="body">
  <span class="badge ok"><span class="dot"></span>Valid certificate</span>
  <p class="name">${esc(holder?.name ?? cert.holderName)}</p>
  <p class="trade">${esc(holder?.trade ?? cert.qpTitle)}</p>
  <div class="grid">
    <div class="stat"><div class="k">Overall score</div><div class="v score">${esc(Math.round(cert.overallScore))}<span style="font-size:14px;color:#64748b">/100</span></div></div>
    <div class="stat"><div class="k">NSQF level</div><div class="v score">L${esc(cert.nsqfLevel)}</div></div>
  </div>
  <div style="margin-top:14px">
    <div class="row"><span class="k">Certificate no.</span><span class="v mono">${esc(cert.certificateNo)}</span></div>
    <div class="row"><span class="k">Issued</span><span class="v">${esc(fmtDate(cert.issuedAt))}</span></div>
    <div class="row"><span class="k">Assessment status</span><span class="v">${esc(STATUS_LABEL[asmt?.status ?? ''] ?? asmt?.status ?? '—')}</span></div>
    <div class="row"><span class="k">Decision date</span><span class="v">${esc(fmtDate(asmt?.decidedAt))}</span></div>
  </div>
</div></div>`;
  const jsonAlt = `<link rel="alternate" type="application/json" href="/verify/${encodeURIComponent(certificateNo)}?format=json">`;
  return shell(`Verified — ${cert.certificateNo}`, inner, jsonAlt);
}

function revokedPage(result: VerifyResult, certificateNo: string): string {
  const cert = result.certificate;
  const inner = `
<div class="card"><div class="body">
  <span class="badge warn"><span class="dot"></span>Certificate revoked</span>
  <h1>This certificate is no longer valid</h1>
  <p class="sub">It was issued to ${esc(cert?.holderName ?? 'a candidate')} but has since been revoked.</p>
  <div class="row"><span class="k">Certificate no.</span><span class="v mono">${esc(cert?.certificateNo ?? certificateNo)}</span></div>
  <div class="row"><span class="k">Original issue date</span><span class="v">${esc(fmtDate(cert?.issuedAt))}</span></div>
</div></div>`;
  return shell('Certificate revoked', inner);
}

function notFoundPage(certificateNo: string): string {
  const inner = `
<div class="card"><div class="body">
  <span class="badge bad"><span class="dot"></span>Not found</span>
  <h1>No matching certificate</h1>
  <p class="sub">We could not find a certificate with the number <span class="mono">${esc(certificateNo)}</span>. Check the number printed under the QR code and try again.</p>
  ${searchForm(certificateNo)}
</div></div>`;
  return shell('Certificate not found', inner);
}

function searchForm(value = ''): string {
  return `<form method="get" action="/verify" role="search">
  <input name="certificateNo" value="${esc(value)}" placeholder="e.g. SIH-RPL-2026-1A2B3C4D" aria-label="Certificate number" autocomplete="off">
  <button type="submit">Verify</button></form>`;
}

function searchPage(): string {
  const inner = `
<div class="card"><div class="body">
  <h1>Verify a certificate</h1>
  <p class="sub">Scan the QR code on a certificate or enter its number below. No login required.</p>
  ${searchForm()}
  <p class="mock">Tip: this page is also available as JSON at <span class="mono">/verify/&lt;number&gt;?format=json</span>.</p>
</div></div>`;
  return shell('Verify a certificate', inner);
}

/* ------------------------------- router ----------------------------- */

function wantsJson(req: Request): boolean {
  if (String(req.query.format ?? '').toLowerCase() === 'json') return true;
  return req.accepts(['html', 'json']) === 'json';
}

async function respond(req: Request, res: Response): Promise<void> {
  const certificateNo = String(req.params.certificateNo ?? req.query.certificateNo ?? '').trim();
  res.setHeader('Cache-Control', 'no-store');

  if (!certificateNo) {
    res.type('html').status(200).send(searchPage());
    return;
  }

  let result: VerifyResult;
  try {
    result = await verifyCertificate(certificateNo);
  } catch (err) {
    logger.error({ err, certificateNo }, 'public verify failed');
    if (wantsJson(req)) {
      res.status(500).json({ valid: false, reason: 'error' });
      return;
    }
    res.type('html').status(500).send(notFoundPage(certificateNo));
    return;
  }

  if (wantsJson(req)) {
    res.status(result.valid ? 200 : 404).json(result);
    return;
  }

  if (result.valid) {
    res.type('html').status(200).send(validPage(result, certificateNo));
  } else if (result.reason === 'revoked') {
    res.type('html').status(200).send(revokedPage(result, certificateNo));
  } else {
    res.type('html').status(404).send(notFoundPage(certificateNo));
  }
}

export function registerVerifyPage(app: Express): void {
  app.get('/verify', (req, res, next) => {
    void respond(req, res).catch(next);
  });
  app.get('/verify/:certificateNo', (req, res, next) => {
    void respond(req, res).catch(next);
  });
}
