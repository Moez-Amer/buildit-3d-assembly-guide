// Sign-in by email link ("magic link"): no passwords. The user types their email, gets a link that works once for
// 15 minutes, and opening it starts a 30-day session (an HttpOnly cookie). See server/db.js for what is stored.
import { sendMail, mailReady, TEST_SENDER } from './mail.js';
import { createLoginToken, useLoginToken, peekLoginToken, userByEmail, createSession, sessionUser, endSession, endAllSessions, LINK_MINUTES, SESSION_DAYS } from './db.js';

// development (npm run dev sets DEV=1): sign-in links go to the server log, and the link may point at a local address.
// Anything else needs APP_URL, MAIL_FROM and an email service (RESEND_API_KEY or SMTP_URL), or the server does not
// start (see checkConfig).
export const DEV = process.env.DEV === '1' && process.env.NODE_ENV !== 'production';
const COOKIE = '__Host-bi_session'; // __Host-: only over https, only for this exact site, never for subdomains
const ADMINS = new Set((process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
// who may scan their own manual until payments exist: "admins" (default) or "everyone" signed in
const SCAN_ACCESS = process.env.SCAN_ACCESS === 'everyone' ? 'everyone' : 'admins';

export const isAdmin = u => !!u && ADMINS.has(u.email);
export const canScan = u => !!u && (SCAN_ACCESS === 'everyone' || isAdmin(u));
export const publicUser = u => u && { email: u.email, admin: isAdmin(u), canScan: canScan(u) };

/* ---------- small helpers ---------- */
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i <= 0) continue;
    // another site's cookie on the same domain may be badly encoded: skip it instead of failing the request
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* not ours */ }
  }
  return out;
}
const setSessionCookie = (res, token) => res.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
const clearSessionCookie = res => res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);

/** Fixed-window counter per key, kept in memory (enough for one server). Returns true while under the limit. */
export function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset < t) hits.delete(k); }, windowMs).unref();
  return key => {
    const t = Date.now(), h = hits.get(key);
    if (!h || h.reset < t) { hits.set(key, { n: 1, reset: t + windowMs }); return true; }
    return ++h.n <= max;
  };
}
const ipStarts = limiter(10, 60 * 60e3), emailStarts = limiter(3, 15 * 60e3), ipVerifies = limiter(30, 15 * 60e3);

/** Stops the server at start when it would run unsafely outside development. */
export function checkConfig() {
  if (DEV) return;
  const missing = ['APP_URL', 'MAIL_FROM'].filter(k => !process.env[k]);
  if (!mailReady) missing.push('RESEND_API_KEY (or SMTP_URL)');
  if (missing.length) { console.error(`Not starting: set ${missing.join(', ')} in .env (or DEV=1 for local development).`); process.exit(1); }
  // Resend's test sender only reaches the Resend account's own address: real visitors would never get their link
  if (process.env.MAIL_FROM.includes(TEST_SENDER)) { console.error(`Not starting: MAIL_FROM must be an address on your own verified domain, not ${TEST_SENDER}.`); process.exit(1); }
  if (!/^https:\/\//.test(process.env.APP_URL)) { console.error('Not starting: APP_URL must start with https://'); process.exit(1); }
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
export const cleanEmail = s => { const e = String(s ?? '').trim().toLowerCase(); return e.length <= 254 && EMAIL.test(e) ? e : null; };

// where the link in the email points. Never taken from the request in production: a forged Host header would
// send the victim's sign-in link to someone else's site.
function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (!DEV) throw new Error('APP_URL is not set');
  const o = String(req.headers.origin || '');
  try { const u = new URL(o); if (/^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(u.hostname)) return u.origin; } catch { /* no origin */ }
  return `https://localhost:${process.env.WEB_PORT || 5173}`;
}

/* ---------- email ---------- */
async function sendLink(email, url) {
  const text = `Here is your link to sign in to Buildit:\n\n${url}\n\nIt works once, for ${LINK_MINUTES} minutes. If you did not ask for it, ignore this email: nobody can sign in without the link.\n`;
  const html = `<div style="font:16px/1.5 system-ui,sans-serif;color:#15181C;max-width:480px">
    <p>Here is your link to sign in to <b>Buildit</b>.</p>
    <p><a href="${url}" style="display:inline-block;background:#FFB300;color:#2A1E00;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">Sign in to Buildit</a></p>
    <p style="color:#5B626A;font-size:14px">It works once, for ${LINK_MINUTES} minutes. If you did not ask for it, ignore this email: nobody can sign in without the link.</p></div>`;
  // development only, and only into the log on this computer: never into the reply, where anyone who can
  // reach the dev server (it listens on the Wi-Fi too) could use it to sign in as someone else
  const toLog = why => console.log(`sign-in link for ${email} (${why}): ${url}`);
  if (!mailReady) {
    if (!DEV) throw new Error('No email service is set');
    return toLog('no email service set, so not emailed');
  }
  try {
    await sendMail({ to: email, subject: 'Your Buildit sign-in link', text, html });
  } catch (e) {
    // in development a failed email (e.g. Resend's test sender writing to someone else) must not lock you out
    if (!DEV) throw e;
    toLog(`email failed: ${e.message}`);
  }
}

/* ---------- middleware ---------- */
/** Sets req.user (or null) from the session cookie. */
export function currentUser(req, _res, next) { req.user = sessionUser(cookies(req)[COOKIE]); next(); }
export function requireUser(req, res, next) { if (!req.user) return res.status(401).json({ error: 'Sign in first.', code: 'signin' }); next(); }

/**
 * Requests that change something must come from this app: browsers only add a custom header on same-origin requests
 * (a cross-site form or image cannot), and Sec-Fetch-Site tells which site sent it. Together with SameSite cookies this
 * stops other sites from acting with a signed-in user's session (CSRF).
 */
export function sameSiteOnly(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (req.headers['x-buildit'] !== '1' || (site && site !== 'same-origin' && site !== 'none')) return res.status(403).json({ error: 'Request blocked.' });
  next();
}

/* ---------- routes ---------- */
export function authRoutes(app) {
  app.get('/api/me', (req, res) => { res.set('cache-control', 'no-store'); res.json({ user: publicUser(req.user) }); });

  app.post('/api/auth/start', async (req, res) => {
    const email = cleanEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'That does not look like an email address.' });
    if (!ipStarts(req.ip)) return res.status(429).json({ error: 'Too many sign-in emails from here. Try again in an hour.' });
    // the same answer whether or not an account exists, so nobody can test which emails are signed up
    if (!emailStarts(email)) return res.json({ ok: true });
    try {
      const token = createLoginToken(email);
      // the token sits after # so it never reaches server logs or other sites' Referer headers
      await sendLink(email, `${appUrl(req)}/#/signin/${token}`);
      res.json({ ok: true });
    } catch (e) {
      console.error('sign-in email failed:', e.message);
      res.status(502).json({ error: 'The email could not be sent. Try again in a minute.' });
    }
  });

  // the opened link, before it is used: whose account it signs in to (partly hidden), so nobody can slip
  // their own link to someone else and have that person's scans land in their account
  app.post('/api/auth/peek', (req, res) => {
    if (!ipVerifies(req.ip)) return res.status(429).json({ error: 'Too many tries. Wait 15 minutes.' });
    const token = String(req.body?.token ?? '');
    const email = /^[\w-]{20,100}$/.test(token) ? peekLoginToken(token) : null;
    if (!email) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one.', code: 'expired' });
    const [name, domain] = email.split('@');
    res.json({ email: `${name.slice(0, Math.min(2, name.length - 1))}${'•'.repeat(Math.max(3, name.length - 2))}@${domain}` });
  });

  app.post('/api/auth/verify', (req, res) => {
    if (!ipVerifies(req.ip)) return res.status(429).json({ error: 'Too many tries. Wait 15 minutes.' });
    const token = String(req.body?.token ?? '');
    const email = /^[\w-]{20,100}$/.test(token) ? useLoginToken(token) : null;
    if (!email) return res.status(400).json({ error: 'This link has expired or was already used. Ask for a new one.', code: 'expired' });
    const user = userByEmail(email, true);
    endSession(cookies(req)[COOKIE]); // a fresh session id at every sign-in
    setSessionCookie(res, createSession(user.id));
    console.log(`signed in: user ${user.id.slice(0, 8)}`);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/signout', (req, res) => {
    const all = req.body?.everywhere === true && req.user;
    if (all) endAllSessions(req.user.id); else endSession(cookies(req)[COOKIE]);
    clearSessionCookie(res);
    res.json({ ok: true });
  });
}
