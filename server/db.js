// Accounts and guide ownership, in one SQLite file (server/data/buildit.db). Node's built-in SQLite, no extra service.
// Secrets (sign-in links, sessions) are stored only as SHA-256 hashes: a copy of the database cannot be used to sign in.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || path.join(here, 'data', 'buildit.db');
mkdirSync(path.dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, created TEXT NOT NULL, last_login TEXT);
  CREATE TABLE IF NOT EXISTS login_tokens (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL, created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS guides (id TEXT PRIMARY KEY, owner TEXT REFERENCES users(id) ON DELETE SET NULL, product TEXT, steps INTEGER, created TEXT, public INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS guides_owner ON guides(owner);
  CREATE TABLE IF NOT EXISTS notices (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, sent TEXT NOT NULL, PRIMARY KEY (user_id, kind));
  -- one rating per person and guide (27 Nov 2026); saving again changes it. product and company are copied from the
  -- guide when the rating is saved, so the list stays readable after a guide is renamed. Deleting the account deletes them.
  CREATE TABLE IF NOT EXISTS ratings (guide_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5), comment TEXT NOT NULL DEFAULT '', product TEXT, company TEXT,
    created TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY (guide_id, user_id));
  CREATE INDEX IF NOT EXISTS ratings_user ON ratings(user_id);
  -- all ratings combined, one row per guide: SELECT * FROM rating_summary
  CREATE VIEW IF NOT EXISTS rating_summary AS
    SELECT guide_id, MAX(product) AS product, MAX(company) AS company, COUNT(*) AS ratings, ROUND(AVG(stars), 2) AS average,
      SUM(stars = 5) AS five, SUM(stars = 4) AS four, SUM(stars = 3) AS three, SUM(stars = 2) AS two, SUM(stars = 1) AS one,
      SUM(comment <> '') AS comments, MAX(updated) AS last_rated
    FROM ratings GROUP BY guide_id;
`);
// columns added later (24 Nov 2026): the name and article number a library guide is listed under
const guideCols = new Set(db.prepare('PRAGMA table_info(guides)').all().map(c => c.name));
for (const c of ['title', 'article']) if (!guideCols.has(c)) db.exec(`ALTER TABLE guides ADD COLUMN ${c} TEXT`);

export const hash = s => createHash('sha256').update(s).digest('hex');
export const newSecret = () => randomBytes(32).toString('base64url');
const now = () => Date.now();
export const LINK_MINUTES = 15;
export const SESSION_DAYS = 30;

/* ---------- sign-in links ---------- */
export function createLoginToken(email) {
  const token = newSecret();
  db.prepare('DELETE FROM login_tokens WHERE expires < ?').run(now());
  db.prepare('INSERT INTO login_tokens (hash, email, expires) VALUES (?, ?, ?)').run(hash(token), email, now() + LINK_MINUTES * 60e3);
  return token;
}
/** Uses up a sign-in link. Returns the email it was sent to, or null (unknown, used or expired). */
export function useLoginToken(token) {
  const h = hash(String(token));
  // one statement, so the same link can never be used twice even with two requests at once
  const row = db.prepare('UPDATE login_tokens SET used = 1 WHERE hash = ? AND used = 0 AND expires > ? RETURNING email').get(h, now());
  return row?.email ?? null;
}

/** The email a sign-in link was sent to, without using the link up. */
export function peekLoginToken(token) {
  return db.prepare('SELECT email FROM login_tokens WHERE hash = ? AND used = 0 AND expires > ?').get(hash(String(token)), now())?.email ?? null;
}

/* ---------- users ---------- */
export function userByEmail(email, create = false) {
  let u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u && create) {
    u = { id: randomUUID(), email, created: new Date().toISOString() };
    db.prepare('INSERT INTO users (id, email, created) VALUES (?, ?, ?)').run(u.id, u.email, u.created);
  }
  return u ?? null;
}

/* ---------- sessions ---------- */
export function createSession(userId) {
  const token = newSecret();
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(now());
  db.prepare('INSERT INTO sessions (hash, user_id, expires, created) VALUES (?, ?, ?, ?)').run(hash(token), userId, now() + SESSION_DAYS * 864e5, new Date().toISOString());
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), userId);
  return token;
}
export function sessionUser(token) {
  if (!token) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?').get(hash(token), now()) ?? null;
}
export function endSession(token) { if (token) db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash(token)); }
export function deleteUser(user) {
  db.prepare('DELETE FROM login_tokens WHERE email = ?').run(user.email);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id); // sessions go with it (ON DELETE CASCADE)
}
export function endAllSessions(userId) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); }

/* ---------- guides ---------- */
export function addGuide(g, owner) {
  db.prepare('INSERT OR REPLACE INTO guides (id, owner, product, steps, created, public) VALUES (?, ?, ?, ?, ?, ?)')
    .run(g.id, owner ?? null, String(g.product ?? ''), g.steps?.length ?? 0, g.created ?? new Date().toISOString(), g.public ? 1 : 0);
}
export const guideRow = id => db.prepare('SELECT * FROM guides WHERE id = ?').get(id) ?? null;
export const guidesOf = owner => db.prepare('SELECT id, product, steps, created FROM guides WHERE owner = ? ORDER BY created DESC').all(owner);
export const knownGuideIds = () => new Set(db.prepare('SELECT id FROM guides').all().map(r => r.id));
/* ---------- library ("Available manuals"): public guides anyone can open, no account needed ---------- */
export const libraryRows = () => db.prepare('SELECT id, product, title, article FROM guides WHERE public = 1').all();
/** Puts a guide in the library (listed under title and article number) or takes it out. */
export function setLibrary(id, on, { title = null, article = null } = {}) {
  return db.prepare('UPDATE guides SET public = ?, title = COALESCE(?, title), article = COALESCE(?, article) WHERE id = ?').run(on ? 1 : 0, title, article, id).changes > 0;
}

/* ---------- ratings ---------- */
export const ratingOf = (guideId, userId) =>
  db.prepare('SELECT stars, comment, updated FROM ratings WHERE guide_id = ? AND user_id = ?').get(guideId, userId) ?? null;
/** Saves (or changes) one person's rating of one guide. Returns the stored row. */
export function saveRating({ guideId, userId, stars, comment, product = null, company = null }) {
  const t = new Date().toISOString();
  return db.prepare(`INSERT INTO ratings (guide_id, user_id, stars, comment, product, company, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (guide_id, user_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment, product = excluded.product,
      company = excluded.company, updated = excluded.updated
    RETURNING *`).get(guideId, userId, stars, comment, product, company, t, t);
}
export const deleteRatingsOfGuide = guideId => db.prepare('DELETE FROM ratings WHERE guide_id = ?').run(guideId);
export const ratingSummary = () => db.prepare('SELECT * FROM rating_summary ORDER BY ratings DESC, average DESC').all();
/** The newest comments, with their stars and guide (who wrote them is left out). */
export const ratingComments = (limit = 200) => db.prepare(`SELECT guide_id, product, company, stars, comment, updated FROM ratings
  WHERE comment <> '' ORDER BY updated DESC LIMIT ?`).all(limit);
