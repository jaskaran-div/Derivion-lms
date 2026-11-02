/**
 * Shared look of every email the LMS sends: one layout file plus small building blocks, so all messages share the same
 * header, typography, buttons and footer. Everything is table-based with inline styles because mail clients ignore
 * most modern CSS. Every value interpolated into the markup is HTML-escaped here.
 */
const fs = require('fs');
const path = require('path');
const { config } = require('../config/integration');

const TEMPLATE_DIR = path.join(__dirname, '../templates/email');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// {{name}} is HTML-escaped; {{{name}}} is inserted as-is and only ever carries markup produced by this file
const fill = (html, vars) => html
  .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => String(vars[k] ?? ''))
  .replace(/\{\{(\w+)\}\}/g, (_, k) => esc(vars[k]));
const loadTemplate = (name) => fs.readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), 'utf8');

const supportEmail = () => process.env.SUPPORT_EMAIL || config().supportEmail || '';
const appUrl = () => (process.env.APP_URL || '').replace(/\/+$/, '');
/** Absolute address for a path such as "/dashboard"; full URLs pass through unchanged. */
const absUrl = (link) => (/^https?:\/\//.test(link) ? link : `${appUrl()}${link}`);

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ---- building blocks -----------------------------------------------------------------------------------------------
const heading = (text) => `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;">${esc(text)}</h1>`;
const subheading = (text) => `<h2 style="margin:26px 0 8px;font-family:${FONT};font-size:17px;line-height:1.35;font-weight:700;color:#0f172a;">${esc(text)}</h2>`;
const paragraph = (text, { muted = false, small = false } = {}) =>
  `<p style="margin:0 0 16px;font-size:${small ? 13 : 15}px;line-height:1.65;color:${muted ? '#6b7280' : '#374151'};">${esc(text)}</p>`;
/** Paragraph from markup this file produced (e.g. contains <strong>); never pass user input here. */
const paragraphHtml = (html, opts = {}) =>
  `<p style="margin:0 0 16px;font-size:${opts.small ? 13 : 15}px;line-height:1.65;color:${opts.muted ? '#6b7280' : '#374151'};">${html}</p>`;

/** "Bulletproof" button: a table cell with a background colour, so it renders even where CSS padding is stripped. */
const button = (url, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 20px;"><tr>`
  + `<td align="center" bgcolor="#1d4ed8" style="border-radius:8px;"><a href="${esc(url)}" target="_blank" `
  + `style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(label)}</a></td>`
  + `</tr></table>`;

/** The address in plain text under a button, for clients that block links or when the button does not work. */
const linkFallback = (url) =>
  `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#6b7280;">If the button does not work, copy and paste this address into your browser:</p>`
  + `<p style="margin:0 0 18px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${esc(url)}" style="color:#1d4ed8;text-decoration:underline;">${esc(url)}</a></p>`;

const TONES = {
  info: { bg: '#eff6ff', bar: '#1d4ed8', title: '#1e3a8a' },
  success: { bg: '#f0fdf4', bar: '#16a34a', title: '#14532d' },
  warning: { bg: '#fffbeb', bar: '#d97706', title: '#78350f' },
};
/** Highlighted box: a title plus an optional second line (e.g. the course name and its details). */
const callout = (title, body = '', tone = 'info') => {
  const t = TONES[tone] || TONES.info;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;"><tr>`
    + `<td style="background-color:${t.bg};border-left:4px solid ${t.bar};border-radius:0 8px 8px 0;padding:14px 18px;font-family:${FONT};">`
    + `<div style="font-size:16px;font-weight:700;line-height:1.4;color:${t.title};">${esc(title)}</div>`
    + (body ? `<div style="margin-top:4px;font-size:14px;line-height:1.55;color:#4b5563;">${esc(body)}</div>` : '')
    + `</td></tr></table>`;
};

/** Label / value rows, e.g. [['Amount paid', '₹4,999'], ['Invoice', 'INV-2026-00001']]. Empty values are skipped. */
const details = (rows) => {
  const items = rows.filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== '');
  if (!items.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;">`
    + items.map(([label, value], i) =>
      `<tr><td style="padding:10px 14px;color:#6b7280;${i ? 'border-top:1px solid #eef0f3;' : ''}">${esc(label)}</td>`
      + `<td align="right" style="padding:10px 14px;font-weight:600;color:#111827;${i ? 'border-top:1px solid #eef0f3;' : ''}">${esc(value)}</td></tr>`).join('')
    + `</table>`;
};

/** Large one-time code. */
const codeBox = (code) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px;"><tr>`
  + `<td align="center" style="background-color:#f3f4f6;border:1px dashed #9ca3af;border-radius:8px;padding:18px 10px;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#0f172a;">${esc(code)}</td>`
  + `</tr></table>`;

// ---- page ----------------------------------------------------------------------------------------------------------
/** Wrap content in the shared layout. `preheader` is the inbox preview line, `reason` explains why the email was sent. */
const render = (content, { preheader = '', reason = '' } = {}) => {
  const support = supportEmail();
  return fill(loadTemplate('layout'), {
    appName: config().appName,
    homeUrl: appUrl() || '#',
    // The white logo is served by the LMS frontend (public/brand); EMAIL_LOGO_URL overrides it, e.g. to a CDN
    logoUrl: process.env.EMAIL_LOGO_URL || `${appUrl()}/brand/derivion-logo-white.png`,
    preheader,
    reason,
    year: new Date().getFullYear(),
    content,
    supportLine: support ? `Need help? Write to <a href="mailto:${esc(support)}" style="color:#1d4ed8;text-decoration:none;">${esc(support)}</a>.` : '',
  });
};

/** Plain-text alternative generated from the HTML, so clients and spam filters that want one get a readable version. */
const toText = (html) => String(html)
  .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
  .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    const text = label.replace(/<[^>]+>/g, '').trim();
    return !text || text === href ? href : `${text} (${href})`;
  })
  .replace(/<\/(p|div|tr|h[1-6]|table)>/gi, '\n')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/td>/gi, '  ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;|&zwnj;|&#8203;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&copy;/g, '(c)')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

module.exports = {
  esc, fill, loadTemplate, absUrl, render, toText,
  heading, subheading, paragraph, paragraphHtml, button, linkFallback, callout, details, codeBox,
};
