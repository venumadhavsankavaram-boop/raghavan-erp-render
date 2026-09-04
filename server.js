// Express server for Render — serves the ERP's static files AND handles
// every /api/* request, using the exact same tested resource-handling logic
// that ran on Vercel. Only the "wrapper" around it changed: Vercel routed
// dynamically via api/[resource].js; here, Express does the same job via
// an explicit route parameter (req.params.resource instead of
// req.query.resource) — every SIMPLE_RESOURCES / HYBRID_RESOURCES config
// and every custom handler function below is unchanged from what was
// already tested and confirmed working.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Default body-size limit (100kb) is far too small the moment any record
// carries a photo or document as a base64 data URL (website gallery photos,
// student/staff photos, ID card photos, admit-card signatures, admin
// downloads) — those routinely run several hundred KB to a few MB once
// base64-encoded. Under the old default, a POST/PUT carrying one of those
// was rejected by this middleware with 413 Payload Too Large before it ever
// reached a route handler; the client didn't check the response status (see
// the matching index.html fix), so it looked like a normal save while
// nothing was actually written to the database.
//
// One route needs the opposite treatment: /api/admission-inquiries is the
// only endpoint the public school website can POST to with zero login of
// any kind (see WEBSITE_CORS_RULES below) — it's a plain text form (a
// name, an email, a phone number, a note), so it never needs anything
// close to 25mb. Registering a small-limit JSON parser for that one path
// first means it — and only it — gets capped at 20kb; body-parser marks
// the body as already-parsed, so the 25mb parser below skips it and still
// applies normally to every other route. This keeps a stray or malicious
// caller from using the one unauthenticated write endpoint in the app to
// stuff giant payloads into the database.
app.use('/api/admission-inquiries', express.json({ limit: '20kb' }));
app.use(express.json({ limit: '25mb' }));

// The public school website (a separate static site, on its own domain) talks to
// this ERP straight over the network for a handful of resources — it isn't hosted
// on the same origin, so the browser needs an explicit CORS allowance for each one.
// Listed per-resource (not the whole /api/*) so the rest of the API — which
// includes things like user records — stays inaccessible to any other site's
// frontend code. Methods are scoped to what the website actually does with each:
// it only submits inquiries (POST), and only reads everything else (GET).
const WEBSITE_ORIGIN = 'https://raghavan-school-website.onrender.com';
const WEBSITE_CORS_RULES = {
  '/api/admission-inquiries': 'POST, OPTIONS',
  '/api/comms-messages': 'GET, OPTIONS',
  '/api/website-gallery': 'GET, OPTIONS',
  '/api/school-info': 'GET, OPTIONS',
};
app.use((req, res, next) => {
  const allowedMethods = WEBSITE_CORS_RULES[req.path];
  if (allowedMethods) {
    res.header('Access-Control-Allow-Origin', WEBSITE_ORIGIN);
    res.header('Access-Control-Allow-Methods', allowedMethods);
    res.header('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const sql = neon(process.env.DATABASE_URL);

// A request header value that came from decodeURIComponent-encoded text
// (see the client's actorHeaders() helper) — falls back to the raw value
// if it isn't actually encoded, so this never throws on a header some
// other caller (e.g. a script, not this app's own UI) sent unencoded.
function decodeHeaderValue(v) {
  if (!v) return '';
  try { return decodeURIComponent(String(v)); } catch (e) { return String(v); }
}

// ---------- Schema bootstrap ----------
// Every table this app needs, created only if missing. This means standing the
// whole ERP up against a brand-new, completely empty Postgres database (a
// fresh Neon project, for a future re-install) is just: set DATABASE_URL and
// start the server — no separate schema.sql to run by hand, no migration
// step to remember. It's a no-op against the current live database (every
// one of these tables already exists there), so this changes nothing about
// how the app behaves today; it only matters the day this ever needs to be
// stood up again from scratch. Column types are the ones this app's own
// read/write code already expects (JSONB where the code does `::jsonb`
// casts and reads the result back as a real array/object; TEXT — not DATE —
// for date-shaped fields, since a couple of them are legitimately sent as an
// empty string before they're filled in, e.g. a discount's approval date
// before it's approved).
async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT, username TEXT, password TEXT, role TEXT,
    linked_student_id TEXT, recovery_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, receipt_no TEXT, student_id TEXT, student_name TEXT, category TEXT, mode TEXT,
    amount NUMERIC DEFAULT 0, discount NUMERIC DEFAULT 0, instalment TEXT, date TEXT, note TEXT,
    class_at_payment TEXT, extra_fee_name TEXT, extra_fee_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS student_discounts (
    id TEXT PRIMARY KEY, batch_id TEXT, student_id TEXT, type TEXT, applies_to TEXT, mode TEXT,
    value NUMERIC DEFAULT 0, note TEXT, status TEXT, requested_by TEXT, requested_role TEXT, requested_date TEXT,
    approver_id TEXT, approver_name TEXT, approved_by TEXT, approved_date TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS student_extra_fees (
    id TEXT PRIMARY KEY, student_id TEXT, name TEXT, amount NUMERIC DEFAULT 0, paid BOOLEAN DEFAULT false,
    paid_amount NUMERIC DEFAULT 0, date TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY, student_id TEXT, date TEXT, status TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS holidays (
    id TEXT PRIMARY KEY, date TEXT, name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS exam_results (
    id TEXT PRIMARY KEY, exam_id TEXT, student_id TEXT, subject TEXT, marks NUMERIC, absent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS staff_attendance_records (
    id TEXT PRIMARY KEY, staff_id TEXT, date TEXT, status TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS admission_inquiries (
    id TEXT PRIMARY KEY, parent_name TEXT, parent_email TEXT, parent_phone TEXT, student_name TEXT,
    applying_grade TEXT, notes TEXT, submitted_date TEXT, status TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS website_gallery (
    id TEXT PRIMARY KEY, data_url TEXT, category TEXT, caption TEXT, uploaded_date TEXT, uploaded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, class_name TEXT, section TEXT, status TEXT,
    admission_no TEXT, extra JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, department TEXT, designation TEXT, status TEXT,
    staff_id TEXT, extra JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS staff_payroll (
    id TEXT PRIMARY KEY, staff_id TEXT, month TEXT, status TEXT,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS comms_messages (
    id TEXT PRIMARY KEY, extra JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY, extra JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS exam_hall_tickets (
    id TEXT PRIMARY KEY, extra JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS exam_room_config (
    id TEXT PRIMARY KEY, extra JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY, name TEXT, code TEXT, class_name TEXT,
    sections JSONB NOT NULL DEFAULT '[]'::jsonb, section_staff JSONB NOT NULL DEFAULT '{}'::jsonb,
    staff_ids JSONB NOT NULL DEFAULT '[]'::jsonb, countable BOOLEAN DEFAULT true, elective BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS exam_defs (
    id TEXT PRIMARY KEY, name TEXT, exam_type TEXT, start_date TEXT, end_date TEXT,
    class_subjects JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS custom_roles (
    id TEXT PRIMARY KEY, name TEXT, permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS fee_structure (
    class_name TEXT PRIMARY KEY, admission NUMERIC DEFAULT 0, fee NUMERIC DEFAULT 0,
    bus NUMERIC DEFAULT 0, stock NUMERIC DEFAULT 0
  )`;
  await sql`CREATE TABLE IF NOT EXISTS attendance_settings (
    id INTEGER PRIMARY KEY, threshold NUMERIC DEFAULT 75, working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5,6]'::jsonb
  )`;
  await sql`CREATE TABLE IF NOT EXISTS school_info (
    id INTEGER PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb
  )`;
  // One row per numbering series per period (e.g. series='income_voucher',
  // period='26-27') — see the "Document numbering" section below for how
  // this is used. Deliberately its own tiny table (not a kv_store entry):
  // issuing a number is a single atomic UPDATE...RETURNING against one row
  // here, which Postgres serializes correctly under concurrent requests.
  // kv_store's whole-value PUT (see handleKv below) has no such guarantee —
  // two staff saving a voucher at the same moment could both compute the
  // same "next" number and silently overwrite each other, which is exactly
  // the bug this table exists to close.
  await sql`CREATE TABLE IF NOT EXISTS doc_counters (
    series TEXT NOT NULL, period TEXT NOT NULL, next_seq INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (series, period)
  )`;
  // Accounting: Income (Receipt) and Payment vouchers. These used to live as
  // a single JSON blob per school in kv_store (acct-income / acct-expenses)
  // — every save round-tripped the ENTIRE list, so two staff saving around
  // the same moment could each overwrite the other's entry with no error or
  // warning. Real tables + voucher_no UNIQUE fix both that and the
  // duplicate-numbering problem at once. migrateAccountingFromKv() below
  // copies over anything already recorded the old way, once, at boot.
  // cost_center is a SEPARATE dimension from category: category is the
  // account head (Salaries, Donation, ...); cost_center is the segment this
  // money belongs to (Transport, Inventory, Hostel, School Fees/General) —
  // so income and expenditure can be compared segment-by-segment (e.g. "is
  // running the bus profitable") independently of what account head it's
  // filed under.
  await sql`CREATE TABLE IF NOT EXISTS acct_income (
    id TEXT PRIMARY KEY, voucher_no TEXT UNIQUE, date TEXT, category TEXT, cost_center TEXT, amount NUMERIC DEFAULT 0,
    party TEXT, mode TEXT, reference_no TEXT, description TEXT, added_by TEXT,
    voided BOOLEAN NOT NULL DEFAULT false, void_reason TEXT, voided_by TEXT, voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS acct_expenses (
    id TEXT PRIMARY KEY, voucher_no TEXT UNIQUE, date TEXT, category TEXT, cost_center TEXT, amount NUMERIC DEFAULT 0,
    party TEXT, mode TEXT, reference_no TEXT, description TEXT, added_by TEXT,
    voided BOOLEAN NOT NULL DEFAULT false, void_reason TEXT, voided_by TEXT, voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // The generic key/value table backs every module that doesn't need its own
  // dedicated table with real columns — Inventory, Timetable, Library, Transport,
  // Hostel, Accounting, Fee/Exam sub-settings, Report Template signatures, Class
  // & Section setup, Pending Approvals, and a few others (see index.html's
  // OBJECT_BACKED_KEYS registrations for the full list). Each round-trips its
  // whole current value as JSON, keyed by the same string the module already
  // uses as its storage key, rather than needing one more hand-built table.
  await sql`CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // Who changed what, when. One row per successful write (POST/PUT/DELETE)
  // to any /api/:resource endpoint, written centrally by the main dispatcher
  // rather than by each individual handler — see the comment there. Actor
  // fields are self-reported by the browser (no server-side sessions exist
  // yet to read them from authoritatively), so treat this as "what the app
  // told us happened," same trust level as everything else here today —
  // still genuinely useful for spotting an accidental bulk-delete or
  // tracking down when a record last changed.
  await sql`CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY, actor_name TEXT, actor_role TEXT, method TEXT, resource TEXT,
    record_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  // One row per signed-in browser session. `id` is a SHA-256 hash of the
  // random token actually sent to the browser (in an httpOnly cookie) —
  // never the raw token itself — so reading this table (a backup export, a
  // database console, a leaked dump) can't be turned into a working login
  // cookie for anyone. See the "Session-based authentication" section below
  // for how this is created, checked, and expired.
  await sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user_id TEXT, role TEXT, name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  )`;

  // ---------- Indexes ----------
  // The tables above are all read by student_id / staff_id / username / date
  // lookups constantly (a student's fee history, a staff member's payroll
  // months, attendance for one student across a year, the login lookup on
  // every sign-in) — without an index Postgres has to scan the whole table
  // for each of those. IF NOT EXISTS makes this idempotent and safe to run
  // on every boot, same as the CREATE TABLE statements above. Non-unique on
  // purpose: this is a performance fix, not a data-integrity change — adding
  // a UNIQUE constraint on username here could fail outright (or silently
  // change behavior) if any duplicate usernames already exist in the live
  // data, which is a separate decision from "make lookups fast."
  await sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username))`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments (student_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_student_discounts_student_id ON student_discounts (student_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_student_discounts_batch_id ON student_discounts (batch_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_student_extra_fees_student_id ON student_extra_fees (student_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON attendance_records (student_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records (date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_exam_results_exam_id ON exam_results (exam_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_exam_results_student_id ON exam_results (student_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_staff_attendance_records_staff_id ON staff_attendance_records (staff_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_staff_attendance_records_date ON staff_attendance_records (date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_staff_payroll_staff_id ON staff_payroll (staff_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_admission_inquiries_status ON admission_inquiries (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_website_gallery_category ON website_gallery (category)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_acct_income_date ON acct_income (date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_acct_expenses_date ON acct_expenses (date)`;
}
await ensureSchema();

// ---------- One-time accounting migration: kv_store blobs -> real tables ----------
// Runs once per table (skips if acct_income / acct_expenses already has rows,
// so a restart doesn't re-copy anything). Old entries may already carry a
// duplicate or missing voucherNo (that's the very bug being fixed here), so
// anything that can't keep its original number safely gets a LEGACY- number
// instead of being silently dropped or crashing the migration on the new
// UNIQUE constraint.
async function migrateAccountingFromKv() {
  async function migrateOne(kvKey, table) {
    const [{ c }] = await sql.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
    if (c > 0) return;
    const kvRows = await sql`SELECT value FROM kv_store WHERE key = ${kvKey}`;
    const items = kvRows.length && Array.isArray(kvRows[0].value) ? kvRows[0].value : [];
    if (!items.length) return;
    const seen = new Set();
    let migrated = 0;
    for (const item of items) {
      if (!item || !item.id) continue;
      let voucherNo = item.voucherNo || null;
      if (!voucherNo || seen.has(voucherNo)) voucherNo = 'LEGACY-' + item.id;
      seen.add(voucherNo);
      await sql`
        INSERT INTO ${sql(table)} (id, voucher_no, date, category, cost_center, amount, party, mode, reference_no, description, added_by, voided, void_reason, voided_by, voided_at)
        VALUES (${item.id}, ${voucherNo}, ${item.date || null}, ${item.category || null}, ${item.costCenter || null}, ${Number(item.amount) || 0},
                ${item.party || null}, ${item.mode || null}, ${item.referenceNo || null}, ${item.description || null},
                ${item.addedBy || null}, ${!!item.voided}, ${item.voidReason || null}, ${item.voidedBy || null}, ${item.voidedAt || null})
        ON CONFLICT (id) DO NOTHING
      `;
      migrated++;
    }
    if (migrated) console.log(`Migrated ${migrated} legacy record(s) from kv_store["${kvKey}"] into ${table}.`);
  }
  await migrateOne('acct-income', 'acct_income');
  await migrateOne('acct-expenses', 'acct_expenses');
}
await migrateAccountingFromKv();

// ---------- One-time password migration ----------
// Every password in the `users` table has been plain text since this app's
// first version — readable by anyone who could call GET /api/users, which
// (with no server-side login check on any route yet — see the security
// review) meant anyone who could reach this server at all. This hashes any
// password that isn't already a bcrypt hash (those always start with
// "$2") in place, once, right here at startup, before the server accepts
// its first request — so this school's existing live accounts end up hashed
// with no separate manual step. (A fresh install's seeded admin account is
// inserted already hashed — see seedDefaultAdminIfEmpty below.) Running this
// again on a later restart
// finds every row already hashed and does nothing, so it's safe to leave
// in place permanently rather than removing it after the first deploy.
async function migratePlaintextPasswords() {
  const rows = await sql`SELECT id, password FROM users WHERE password IS NOT NULL AND password NOT LIKE '$2%'`;
  for (const row of rows) {
    const hash = await bcrypt.hash(String(row.password), 10);
    await sql`UPDATE users SET password = ${hash} WHERE id = ${row.id}`;
  }
  if (rows.length) console.log(`Migrated ${rows.length} plaintext password(s) to bcrypt hashes.`);
}
await migratePlaintextPasswords();

// ---------- Seed a default admin only when the users table is completely empty ----------
// The client used to seed a hardcoded admin/admin123 account itself, and the login
// screen displayed that literal credential to every visitor, permanently — anyone
// who opened the browser's view-source could read the password straight out of the
// shipped JavaScript, and anyone who simply loaded the login page saw it printed on
// screen, whether or not an admin had ever changed it. This does the seeding here
// instead: it runs once, only when no user rows exist yet, generates a random
// password, hashes it before it ever reaches the database, and prints the plaintext
// exactly once to this server's own console (visible only in the hosting dashboard's
// logs — never sent to any client, never stored anywhere in plaintext).
async function seedDefaultAdminIfEmpty() {
  const rows = await sql`SELECT id FROM users LIMIT 1`;
  if (rows.length) return;
  const rawPassword = crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(rawPassword, 10);
  const recoveryCode = crypto.randomBytes(6).toString('hex').toUpperCase();
  await sql`
    INSERT INTO users (id, name, username, password, role, linked_student_id, recovery_code)
    VALUES ('u_admin', 'Administrator', 'admin', ${hash}, 'Admin', '', ${recoveryCode})
  `;
  console.log('============================================================');
  console.log('First run: created the default admin account.');
  console.log('  Username: admin');
  console.log(`  Password: ${rawPassword}`);
  console.log('Sign in with this once, then change the password immediately');
  console.log('(Initial Setup -> Users & Roles). Printed only this one time —');
  console.log('it is not stored anywhere in plaintext and will not be shown again.');
  console.log('============================================================');
}
await seedDefaultAdminIfEmpty();

// ---------- Session-based authentication ----------
// Until now, nothing on the server checked whether a caller was logged in
// before answering an /api/* request — the login screen was purely a
// client-side gate, and a request made straight to the API (curl, a
// script, anything other than this app's own login-gated UI) went through
// unchecked. This closes that gap: /api/login now hands back a random
// session token in an httpOnly cookie, and every /api/* route except the
// short public allowlist below requires a valid, unexpired one.
//
// No new dependency: cookies are parsed by hand (a request has at most a
// handful of small key=value pairs — not worth adding a library for), and
// the session store is one more table in the same Postgres database this
// app already has open, rather than a separate service to run and monitor.
//
// The token in the cookie and the token stored server-side are not the
// same string: the cookie holds a random value the browser presents on
// every request, and only that value's SHA-256 hash is kept in the
// `sessions` table (see ensureSchema above) — so a leak of the database
// (a backup file, a console query, anything read-only) can't be replayed
// as a working login the way a stored raw token could be.
function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}
function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
// Render terminates TLS at its edge and forwards to this process over
// plain HTTP, so req.secure is never true here on its own; the standard
// signal a proxy leaves behind is this header (same reasoning as the
// x-forwarded-for read already used for login rate-limiting below).
function isHttpsRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

// A session is good for 30 minutes of inactivity (sliding — each
// authenticated request pushes it back out), up to a hard cap of 12 hours
// from login regardless of activity, so a cookie left open on a shared
// front-office computer can't stay valid indefinitely.
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_ABSOLUTE_MAX_MS = 12 * 60 * 60 * 1000;

async function createSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_IDLE_MS);
  await sql`
    INSERT INTO sessions (id, user_id, role, name, expires_at)
    VALUES (${hashSessionToken(token)}, ${user.id}, ${user.role}, ${user.name}, ${expiresAt.toISOString()})
  `;
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly${secureFlag}; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_ABSOLUTE_MAX_MS / 1000)}`);
}
async function destroySession(req, res) {
  const cookies = parseCookies(req);
  if (cookies.sid) {
    await sql`DELETE FROM sessions WHERE id = ${hashSessionToken(cookies.sid)}`.catch(() => {});
  }
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

// Routes (and only these methods on them) that must keep working with no
// login at all: the public school website submits an inquiry and reads a
// few read-only resources from its own separate domain (see
// WEBSITE_CORS_RULES above — this list is deliberately the same set), plus
// logging in and out are themselves how a session is created or cleared.
const PUBLIC_API_ROUTES = [
  { path: '/api/login', methods: ['POST'] },
  { path: '/api/logout', methods: ['POST'] },
  { path: '/api/admission-inquiries', methods: ['POST'] },
  { path: '/api/comms-messages', methods: ['GET'] },
  { path: '/api/website-gallery', methods: ['GET'] },
  { path: '/api/school-info', methods: ['GET'] },
];
function isPublicApiRoute(req) {
  return PUBLIC_API_ROUTES.some(r => r.path === req.path && r.methods.includes(req.method));
}

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/')) return next(); // static files / the app shell itself stay open
  if (req.method === 'OPTIONS' || isPublicApiRoute(req)) return next();
  try {
    const token = parseCookies(req).sid;
    if (!token) return res.status(401).json({ error: 'Not logged in.' });
    const idHash = hashSessionToken(token);
    const rows = await sql`SELECT * FROM sessions WHERE id = ${idHash}`;
    if (!rows.length) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    const session = rows[0];
    const now = Date.now();
    const createdAt = new Date(session.created_at).getTime();
    if (new Date(session.expires_at).getTime() < now || now - createdAt > SESSION_ABSOLUTE_MAX_MS) {
      await sql`DELETE FROM sessions WHERE id = ${idHash}`.catch(() => {});
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    // Sliding renewal, capped at the absolute 12-hour ceiling from login —
    // fire-and-forget so a slow write here never delays the actual request.
    const newExpires = new Date(Math.min(now + SESSION_IDLE_MS, createdAt + SESSION_ABSOLUTE_MAX_MS));
    sql`UPDATE sessions SET expires_at = ${newExpires.toISOString()}, last_seen_at = now() WHERE id = ${idHash}`.catch(() => {});
    req.authUser = { id: session.user_id, role: session.role, name: session.name };
    next();
  } catch (err) {
    console.error('auth check error:', err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

async function handleKv(req, res, key) {
  if (!key) return res.status(400).json({ error: 'Missing key.' });
  if (req.method === 'GET') {
    const rows = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
    return res.status(200).json(rows.length ? rows[0].value : {});
  }
  if (req.method === 'PUT') {
    const value = req.body;
    const json = JSON.stringify(value === undefined ? {} : value);
    await sql`
      INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${json}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value = ${json}::jsonb, updated_at = now()
    `;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}
app.all('/api/kv/:key', async (req, res) => {
  try {
    return await handleKv(req, res, req.params.key);
  } catch (err) {
    console.error(`kv API error (${req.params.key}):`, err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

// ---------- Document numbering (Income/Payment vouchers, and any future series) ----------
// Indian schools run their financial year April -> March; a receipt/payment
// voucher series conventionally restarts at 1 each financial year rather
// than counting up forever. "26-27" means FY starting April 2026.
function currentFinancialYear() {
  const now = new Date();
  const y = now.getFullYear();
  const startY = now.getMonth() + 1 >= 4 ? y : y - 1; // Jan-Mar still belongs to the FY that started the previous April
  return String(startY % 100).padStart(2, '0') + '-' + String((startY + 1) % 100).padStart(2, '0');
}
// Add a series here (and give it a prefix) any time a new numbered-document
// type needs the same guarantee — e.g. Fee Receipts or Inventory bills later —
// nothing else about this endpoint needs to change.
const DOC_SERIES_PREFIX = {
  income_voucher: 'RV',   // Receipt Voucher — money coming in, other than a fee payment
  payment_voucher: 'PV',  // Payment Voucher — money going out
};
app.post('/api/next-doc-number', async (req, res) => {
  try {
    const series = req.body && req.body.series;
    const prefix = DOC_SERIES_PREFIX[series];
    if (!prefix) return res.status(400).json({ error: 'Unknown numbering series: ' + series });
    const period = currentFinancialYear();
    // Single atomic statement: Postgres locks the (series, period) row for
    // the duration of this UPDATE, so two requests arriving at the same
    // instant are still serialized into 1 and 2, never both getting the same
    // number — this is the guarantee kv_store's whole-blob PUT couldn't give.
    const rows = await sql`
      INSERT INTO doc_counters (series, period, next_seq) VALUES (${series}, ${period}, 1)
      ON CONFLICT (series, period) DO UPDATE SET next_seq = doc_counters.next_seq + 1
      RETURNING next_seq
    `;
    const seq = rows[0].next_seq;
    const docNumber = `${prefix}/${period}/${String(seq).padStart(6, '0')}`;
    return res.status(200).json({ docNumber });
  } catch (err) {
    console.error('next-doc-number error:', err);
    return res.status(500).json({ error: 'Could not issue a document number.' });
  }
});

// ---------- Resource configuration (unchanged from the tested version) ----------
const SIMPLE_RESOURCES = {
  users: {
    table: 'users',
    fields: [
      { app: 'id', col: 'id' }, { app: 'name', col: 'name' }, { app: 'username', col: 'username' },
      { app: 'password', col: 'password' }, { app: 'role', col: 'role' },
      { app: 'linkedStudentId', col: 'linked_student_id' }, { app: 'recoveryCode', col: 'recovery_code' },
    ],
  },
  payments: {
    table: 'payments',
    fields: [
      { app: 'id', col: 'id' }, { app: 'receiptNo', col: 'receipt_no' }, { app: 'studentId', col: 'student_id' },
      { app: 'studentName', col: 'student_name' }, { app: 'category', col: 'category' }, { app: 'mode', col: 'mode' },
      { app: 'amount', col: 'amount', numeric: true }, { app: 'discount', col: 'discount', numeric: true }, { app: 'instalment', col: 'instalment' },
      { app: 'date', col: 'date' }, { app: 'note', col: 'note' }, { app: 'classAtPayment', col: 'class_at_payment' },
      { app: 'extraFeeName', col: 'extra_fee_name' }, { app: 'extraFeeId', col: 'extra_fee_id' },
    ],
  },
  discounts: {
    table: 'student_discounts',
    fields: [
      { app: 'id', col: 'id' }, { app: 'batchId', col: 'batch_id' }, { app: 'studentId', col: 'student_id' },
      { app: 'type', col: 'type' }, { app: 'appliesTo', col: 'applies_to' }, { app: 'mode', col: 'mode' },
      { app: 'value', col: 'value', numeric: true }, { app: 'note', col: 'note' }, { app: 'status', col: 'status' },
      { app: 'requestedBy', col: 'requested_by' }, { app: 'requestedRole', col: 'requested_role' },
      { app: 'requestedDate', col: 'requested_date' }, { app: 'approverId', col: 'approver_id' },
      { app: 'approverName', col: 'approver_name' }, { app: 'approvedBy', col: 'approved_by' },
      { app: 'approvedDate', col: 'approved_date' },
    ],
  },
  'extra-fees': {
    table: 'student_extra_fees',
    fields: [
      { app: 'id', col: 'id' }, { app: 'studentId', col: 'student_id' }, { app: 'name', col: 'name' },
      { app: 'amount', col: 'amount', numeric: true }, { app: 'paid', col: 'paid' }, { app: 'paidAmount', col: 'paid_amount', numeric: true },
      { app: 'date', col: 'date' },
    ],
  },
  attendance: {
    table: 'attendance_records',
    fields: [
      { app: 'id', col: 'id' }, { app: 'studentId', col: 'student_id' }, { app: 'date', col: 'date' },
      { app: 'status', col: 'status' },
    ],
  },
  holidays: {
    table: 'holidays',
    fields: [{ app: 'id', col: 'id' }, { app: 'date', col: 'date' }, { app: 'name', col: 'name' }],
  },
  'exam-results': {
    table: 'exam_results',
    fields: [
      { app: 'id', col: 'id' }, { app: 'examId', col: 'exam_id' }, { app: 'studentId', col: 'student_id' },
      { app: 'subject', col: 'subject' }, { app: 'marks', col: 'marks', numeric: true }, { app: 'absent', col: 'absent' },
    ],
  },
  'staff-attendance': {
    table: 'staff_attendance_records',
    fields: [
      { app: 'id', col: 'id' }, { app: 'staffId', col: 'staff_id' }, { app: 'date', col: 'date' },
      { app: 'status', col: 'status' },
    ],
  },
  'admission-inquiries': {
    table: 'admission_inquiries',
    fields: [
      { app: 'id', col: 'id' }, { app: 'parentName', col: 'parent_name' }, { app: 'parentEmail', col: 'parent_email' },
      { app: 'parentPhone', col: 'parent_phone' }, { app: 'studentName', col: 'student_name' },
      { app: 'applyingGrade', col: 'applying_grade' }, { app: 'notes', col: 'notes' },
      { app: 'submittedDate', col: 'submitted_date' }, { app: 'status', col: 'status' },
    ],
  },
  'website-gallery': {
    table: 'website_gallery',
    fields: [
      { app: 'id', col: 'id' }, { app: 'dataUrl', col: 'data_url' }, { app: 'category', col: 'category' },
      { app: 'caption', col: 'caption' }, { app: 'uploadedDate', col: 'uploaded_date' },
      { app: 'uploadedBy', col: 'uploaded_by' },
    ],
  },
  'acct-income': {
    table: 'acct_income',
    fields: [
      { app: 'id', col: 'id' }, { app: 'voucherNo', col: 'voucher_no' }, { app: 'date', col: 'date' },
      { app: 'category', col: 'category' }, { app: 'costCenter', col: 'cost_center' },
      { app: 'amount', col: 'amount', numeric: true }, { app: 'party', col: 'party' }, { app: 'mode', col: 'mode' },
      { app: 'referenceNo', col: 'reference_no' }, { app: 'description', col: 'description' }, { app: 'addedBy', col: 'added_by' },
      { app: 'voided', col: 'voided' }, { app: 'voidReason', col: 'void_reason' },
      { app: 'voidedBy', col: 'voided_by' }, { app: 'voidedAt', col: 'voided_at' },
    ],
  },
  'acct-expenses': {
    table: 'acct_expenses',
    fields: [
      { app: 'id', col: 'id' }, { app: 'voucherNo', col: 'voucher_no' }, { app: 'date', col: 'date' },
      { app: 'category', col: 'category' }, { app: 'costCenter', col: 'cost_center' },
      { app: 'amount', col: 'amount', numeric: true }, { app: 'party', col: 'party' }, { app: 'mode', col: 'mode' },
      { app: 'referenceNo', col: 'reference_no' }, { app: 'description', col: 'description' }, { app: 'addedBy', col: 'added_by' },
      { app: 'voided', col: 'voided' }, { app: 'voidReason', col: 'void_reason' },
      { app: 'voidedBy', col: 'voided_by' }, { app: 'voidedAt', col: 'voided_at' },
    ],
  },
};

const HYBRID_RESOURCES = {
  students: {
    table: 'students',
    core: [
      { app: 'id', col: 'id' }, { app: 'firstName', col: 'first_name' }, { app: 'lastName', col: 'last_name' },
      { app: 'className', col: 'class_name' }, { app: 'section', col: 'section' }, { app: 'status', col: 'status' },
      { app: 'admissionNo', col: 'admission_no' },
    ],
  },
  staff: {
    table: 'staff',
    core: [
      { app: 'id', col: 'id' }, { app: 'firstName', col: 'first_name' }, { app: 'lastName', col: 'last_name' },
      { app: 'department', col: 'department' }, { app: 'designation', col: 'designation' },
      { app: 'status', col: 'status' }, { app: 'staffId', col: 'staff_id' },
    ],
  },
  'staff-payroll': {
    table: 'staff_payroll',
    core: [
      { app: 'id', col: 'id' }, { app: 'staffId', col: 'staff_id' }, { app: 'month', col: 'month' },
      { app: 'status', col: 'status' },
    ],
  },
  // Notice Board / Communications messages — shape varies quite a bit record to
  // record (a "channels" array, an optional "boardRemoved" flag, etc.), so only
  // "id" is a real column; everything else rides in "extra" like the fields above.
  'comms-messages': {
    table: 'comms_messages',
    core: [{ app: 'id', col: 'id' }],
  },
  // Exam room master list (name/capacity) and per-student hall ticket numbers —
  // both are small, free-form records, so only "id" is a real column.
  rooms: {
    table: 'rooms',
    core: [{ app: 'id', col: 'id' }],
  },
  'exam-hall-tickets': {
    table: 'exam_hall_tickets',
    core: [{ app: 'id', col: 'id' }],
  },
  // Per-exam Room Allotment settings (which classes are in scope, print
  // orientation/page size) — one small record per exam, keyed by examId.
  'exam-room-config': {
    table: 'exam_room_config',
    core: [{ app: 'id', col: 'id' }],
  },
};

// ---------- Generic helpers for "simple" resources ----------
// Postgres NUMERIC columns come back from this driver as strings, not JS
// numbers — arbitrary-precision decimals can't always be represented as a
// float, so the driver plays it safe and hands back text (this is also why
// handleFeeStructure and handleAttendanceSettings below already wrap their
// NUMERIC columns in Number()). Every field marked `numeric: true` here
// gets the same treatment, so a caller doing `total += row.amount` gets a
// real sum instead of silently concatenating strings — exactly what was
// happening to exam marks totals in report cards before this. Null stays
// null (a real "not entered yet"/absent marker) rather than becoming 0.
function simpleToAppShape(row, fields) {
  const out = {};
  fields.forEach(f => {
    let v = row[f.col];
    if (v && typeof v === 'object' && v instanceof Date) v = v.toISOString().slice(0, 10);
    else if (f.numeric && v !== null && v !== undefined) v = Number(v);
    out[f.app] = v;
  });
  return out;
}
async function handleSimple(req, res, config) {
  const { table, fields } = config;
  if (req.method === 'GET') {
    const rows = await sql.query(`SELECT * FROM ${table} ORDER BY created_at ASC NULLS LAST`);
    return res.status(200).json(rows.map(r => simpleToAppShape(r, fields)));
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const body = req.body || {};
    if (!body.id) return res.status(400).json({ error: 'Missing id.' });
    const cols = fields.map(f => f.col);
    const vals = fields.map(f => (body[f.app] === undefined ? null : body[f.app]));
    if (req.method === 'POST') {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await sql.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
      return res.status(201).json({ ok: true });
    } else {
      const setClause = cols.filter(c => c !== 'id').map((c, i) => `${c} = $${i + 2}`).join(', ');
      const updateVals = [body.id, ...fields.filter(f => f.col !== 'id').map(f => (body[f.app] === undefined ? null : body[f.app]))];
      await sql.query(`UPDATE ${table} SET ${setClause} WHERE id = $1`, updateVals);
      return res.status(200).json({ ok: true });
    }
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    await sql.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

// The `users` resource needs its own version of the above rather than going
// through the generic handleSimple(): it's the one resource with a password
// field, which has two rules nothing else needs — GET must never send it
// back (hashed or not, the browser has no legitimate use for it), and a
// PUT that doesn't include a new one must leave the existing hash alone
// instead of overwriting it with null the way handleSimple's generic
// "missing field → null" behavior would (every edit to a user's name,
// role, etc. goes through the same PUT the client already used before this
// change, and the client can no longer echo back a password it was never
// given in the first place).
async function handleUsers(req, res) {
  const config = SIMPLE_RESOURCES.users;
  const { table, fields } = config;
  if (req.method === 'GET') {
    const rows = await sql.query(`SELECT * FROM ${table} ORDER BY created_at ASC NULLS LAST`);
    return res.status(200).json(rows.map(r => {
      const shaped = simpleToAppShape(r, fields);
      delete shaped.password;
      return shaped;
    }));
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const body = { ...(req.body || {}) };
    if (!body.id) return res.status(400).json({ error: 'Missing id.' });
    if (req.method === 'POST') {
      if (!body.password) return res.status(400).json({ error: 'Password is required for a new user.' });
      body.password = await bcrypt.hash(String(body.password), 10);
    } else if (body.password) {
      body.password = await bcrypt.hash(String(body.password), 10);
    } else {
      const existing = await sql`SELECT password FROM users WHERE id = ${body.id}`;
      body.password = existing.length ? existing[0].password : null;
    }
    const cols = fields.map(f => f.col);
    const vals = fields.map(f => (body[f.app] === undefined ? null : body[f.app]));
    if (req.method === 'POST') {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await sql.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
      return res.status(201).json({ ok: true });
    } else {
      const setClause = cols.filter(c => c !== 'id').map((c, i) => `${c} = $${i + 2}`).join(', ');
      const updateVals = [body.id, ...fields.filter(f => f.col !== 'id').map(f => (body[f.app] === undefined ? null : body[f.app]))];
      await sql.query(`UPDATE ${table} SET ${setClause} WHERE id = $1`, updateVals);
      return res.status(200).json({ ok: true });
    }
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    await sql`DELETE FROM users WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

// ---------- Generic helpers for "hybrid" (core + JSONB extra) resources ----------
function hybridToAppShape(row, core) {
  const out = {};
  core.forEach(f => { out[f.app] = row[f.col]; });
  return { ...out, ...(row.extra || {}) };
}
function splitCoreExtra(body, core) {
  const coreAppKeys = core.map(f => f.app);
  const extra = {};
  Object.keys(body).forEach(k => { if (!coreAppKeys.includes(k)) extra[k] = body[k]; });
  const coreVals = {};
  core.forEach(f => { coreVals[f.app] = body[f.app] !== undefined ? body[f.app] : (f.app === 'status' ? 'Active' : ''); });
  return { coreVals, extra };
}
async function handleHybrid(req, res, config) {
  const { table, core } = config;
  if (req.method === 'GET') {
    const rows = await sql.query(`SELECT * FROM ${table} ORDER BY created_at ASC NULLS LAST`);
    return res.status(200).json(rows.map(r => hybridToAppShape(r, core)));
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const body = req.body || {};
    if (!body.id) return res.status(400).json({ error: 'Missing id.' });
    const { coreVals, extra } = splitCoreExtra(body, core);
    const cols = core.map(f => f.col);
    const vals = core.map(f => coreVals[f.app]);
    if (req.method === 'POST') {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await sql.query(
        `INSERT INTO ${table} (${cols.join(', ')}, extra) VALUES (${placeholders}, $${cols.length + 1}::jsonb)`,
        [...vals, JSON.stringify(extra)]
      );
      return res.status(201).json({ ok: true });
    } else {
      const setClause = cols.filter(c => c !== 'id').map((c, i) => `${c} = $${i + 2}`).join(', ');
      const nonIdVals = core.filter(f => f.col !== 'id').map(f => coreVals[f.app]);
      await sql.query(
        `UPDATE ${table} SET ${setClause}, extra = $${nonIdVals.length + 2}::jsonb WHERE id = $1`,
        [body.id, ...nonIdVals, JSON.stringify(extra)]
      );
      return res.status(200).json({ ok: true });
    }
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    await sql.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

// ---------- Custom per-resource handlers ----------
async function handleSubjects(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM subjects ORDER BY created_at ASC`;
    return res.status(200).json(rows.map(r => ({
      id: r.id, name: r.name, code: r.code || '', className: r.class_name,
      sections: r.sections || [], sectionStaff: r.section_staff || {}, staffIds: r.staff_ids || [],
      countable: r.countable, elective: r.elective,
    })));
  }
  if (req.method === 'POST') {
    const s = req.body;
    if (!s.id || !s.name || !s.className) return res.status(400).json({ error: 'Missing required fields.' });
    await sql`
      INSERT INTO subjects (id, name, code, class_name, sections, section_staff, staff_ids, countable, elective)
      VALUES (${s.id}, ${s.name}, ${s.code || ''}, ${s.className}, ${JSON.stringify(s.sections || [])}::jsonb,
              ${JSON.stringify(s.sectionStaff || {})}::jsonb, ${JSON.stringify(s.staffIds || [])}::jsonb,
              ${s.countable !== false}, ${!!s.elective})
    `;
    return res.status(201).json({ ok: true });
  }
  if (req.method === 'PUT') {
    const s = req.body;
    if (!s.id) return res.status(400).json({ error: 'Missing id.' });
    await sql`
      UPDATE subjects SET name = ${s.name}, code = ${s.code || ''}, class_name = ${s.className},
        sections = ${JSON.stringify(s.sections || [])}::jsonb, section_staff = ${JSON.stringify(s.sectionStaff || {})}::jsonb,
        staff_ids = ${JSON.stringify(s.staffIds || [])}::jsonb, countable = ${s.countable !== false}, elective = ${!!s.elective}
      WHERE id = ${s.id}
    `;
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    await sql`DELETE FROM subjects WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleExamDefs(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM exam_defs ORDER BY created_at ASC`;
    return res.status(200).json(rows.map(r => ({
      id: r.id, name: r.name, examType: r.exam_type,
      startDate: r.start_date ? r.start_date.toISOString().slice(0, 10) : '',
      endDate: r.end_date ? r.end_date.toISOString().slice(0, 10) : '',
      classSubjects: r.class_subjects || {},
    })));
  }
  if (req.method === 'POST') {
    const e = req.body;
    if (!e.id || !e.name) return res.status(400).json({ error: 'Missing required fields.' });
    await sql`
      INSERT INTO exam_defs (id, name, exam_type, start_date, end_date, class_subjects)
      VALUES (${e.id}, ${e.name}, ${e.examType}, ${e.startDate || null}, ${e.endDate || null}, ${JSON.stringify(e.classSubjects || {})}::jsonb)
    `;
    return res.status(201).json({ ok: true });
  }
  if (req.method === 'PUT') {
    const e = req.body;
    if (!e.id) return res.status(400).json({ error: 'Missing id.' });
    await sql`
      UPDATE exam_defs SET name = ${e.name}, exam_type = ${e.examType}, start_date = ${e.startDate || null},
        end_date = ${e.endDate || null}, class_subjects = ${JSON.stringify(e.classSubjects || {})}::jsonb
      WHERE id = ${e.id}
    `;
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    await sql`DELETE FROM exam_defs WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleRoles(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM custom_roles ORDER BY created_at ASC`;
    return res.status(200).json(rows.map(r => ({ id: r.id, name: r.name, permissions: r.permissions })));
  }
  if (req.method === 'POST') {
    const r = req.body;
    if (!r.id || !r.name) return res.status(400).json({ error: 'Missing required fields.' });
    await sql`INSERT INTO custom_roles (id, name, permissions) VALUES (${r.id}, ${r.name}, ${JSON.stringify(r.permissions || {})}::jsonb)`;
    return res.status(201).json({ ok: true });
  }
  if (req.method === 'PUT') {
    const r = req.body;
    if (!r.id) return res.status(400).json({ error: 'Missing id.' });
    await sql`UPDATE custom_roles SET name = ${r.name}, permissions = ${JSON.stringify(r.permissions || {})}::jsonb WHERE id = ${r.id}`;
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    await sql`DELETE FROM custom_roles WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleFeeStructure(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM fee_structure`;
    const obj = {};
    rows.forEach(r => { obj[r.class_name] = { admission: Number(r.admission), fee: Number(r.fee), bus: Number(r.bus), stock: Number(r.stock) }; });
    return res.status(200).json(obj);
  }
  if (req.method === 'PUT') {
    const structure = req.body || {};
    for (const [className, rates] of Object.entries(structure)) {
      await sql`
        INSERT INTO fee_structure (class_name, admission, fee, bus, stock)
        VALUES (${className}, ${rates.admission || 0}, ${rates.fee || 0}, ${rates.bus || 0}, ${rates.stock || 0})
        ON CONFLICT (class_name) DO UPDATE SET admission = ${rates.admission || 0}, fee = ${rates.fee || 0}, bus = ${rates.bus || 0}, stock = ${rates.stock || 0}
      `;
    }
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleSchoolInfo(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT data FROM school_info WHERE id = 1`;
    if (rows.length === 0) return res.status(200).json({});
    return res.status(200).json(rows[0].data || {});
  }
  if (req.method === 'PUT') {
    const info = req.body || {};
    await sql`
      INSERT INTO school_info (id, data) VALUES (1, ${JSON.stringify(info)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(info)}::jsonb
    `;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleAttendanceSettings(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM attendance_settings WHERE id = 1`;
    if (rows.length === 0) return res.status(200).json({});
    return res.status(200).json({ threshold: Number(rows[0].threshold), workingDays: rows[0].working_days });
  }
  if (req.method === 'PUT') {
    const s = req.body || {};
    await sql`
      INSERT INTO attendance_settings (id, threshold, working_days)
      VALUES (1, ${s.threshold || 75}, ${JSON.stringify(s.workingDays || [1,2,3,4,5,6])}::jsonb)
      ON CONFLICT (id) DO UPDATE SET threshold = ${s.threshold || 75}, working_days = ${JSON.stringify(s.workingDays || [1,2,3,4,5,6])}::jsonb
    `;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed.' });
}

// ---------- Online fee payment (Razorpay) ----------
// Two-step flow, standard for Razorpay: the browser asks us to open an "order"
// for a specific amount, Razorpay's own checkout popup collects the
// card/UPI/netbanking details directly (this server — and the rest of this
// codebase — never sees a card number or bank detail), and finally the
// browser reports back that it succeeded, which we verify ourselves against
// the signature Razorpay signs before trusting it and recording a payment.
// Reads RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET from Render's environment —
// set those in Render → this service → Environment once you have a Razorpay
// account; until then these routes reply 501 and the "Pay Online" button
// tells the parent to pay at the office instead.
function razorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
app.post('/api/payments/create-order', async (req, res) => {
  try {
    if (!razorpayConfigured()) {
      return res.status(501).json({ error: 'Online payments are not set up yet. Ask your Admin to add a Razorpay account.' });
    }
    const amount = Number(req.body?.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount.' });
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Razorpay wants paise, not rupees
        currency: 'INR',
        receipt: 'fee_' + Date.now(),
      }),
    });
    const order = await rzRes.json();
    if (!rzRes.ok) {
      console.error('razorpay create-order failed:', order);
      return res.status(502).json({ error: order?.error?.description || 'Could not start the payment.' });
    }
    return res.status(200).json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('razorpay create-order error:', err);
    return res.status(500).json({ error: 'Could not start the payment. Please try again.' });
  }
});
app.post('/api/payments/verify', async (req, res) => {
  try {
    if (!razorpayConfigured()) {
      return res.status(501).json({ error: 'Online payments are not set up yet.' });
    }
    const {
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      studentId, studentName, amount, category, classAtPayment, extraFeeName, extraFeeId,
    } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !studentId || !amount) {
      return res.status(400).json({ error: 'Missing payment details.' });
    }
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed — this does not look like a genuine Razorpay confirmation.' });
    }
    // Signature checks out against our own secret, so Razorpay itself vouches this
    // payment happened — safe to record it as a real payment now.
    const id = 'pay_' + Date.now() + '_' + razorpay_payment_id;
    await sql`
      INSERT INTO payments (id, receipt_no, student_id, student_name, category, mode, amount, discount, instalment, date, note, class_at_payment, extra_fee_name, extra_fee_id)
      VALUES (
        ${id}, ${razorpay_payment_id}, ${studentId}, ${studentName || ''}, ${category || 'fee'}, 'Online',
        ${amount}, 0, '', ${new Date().toISOString().slice(0, 10)}, ${'Paid online via Razorpay — ' + razorpay_payment_id},
        ${classAtPayment || ''}, ${extraFeeName || null}, ${extraFeeId || null}
      )
    `;
    return res.status(200).json({ ok: true, paymentId: id, receiptNo: razorpay_payment_id });
  } catch (err) {
    console.error('razorpay verify error:', err);
    return res.status(500).json({ error: 'Payment succeeded but we could not record it — please contact the school office with your payment ID.' });
  }
});

// ---------- Login ----------
// The only place a username/password pair is ever checked now that GET
// /api/users no longer sends passwords to the browser at all (see
// handleUsers and the migration above) — the app's own login screen, the
// "change my password" screens (which re-verify the current password
// before accepting a new one), and nothing else, all call this instead of
// comparing locally. Deliberately returns the same generic message on a
// bad username and a bad password, rather than confirming which one was
// wrong, so this can't be used to enumerate valid usernames.
// ---------- Login rate limiting ----------
// In-memory (per-process) tracking of failed login attempts, keyed by
// IP + username so one bad actor guessing one account can't lock out
// every other user, and one legitimate user mistyping their own password
// a few times doesn't get caught by someone else's attempts elsewhere.
// This is enough for this app's actual deployment — a single Render
// instance, no load balancer spreading requests across processes — without
// adding a dependency or a database table just to store short-lived
// counters that only ever need to survive a few minutes.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map(); // key -> { count, firstAttempt, blockedUntil }

function loginRateKey(req, username) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (fwd ? String(fwd).split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
  return ip + '|' + String(username || '').toLowerCase();
}

// Returns seconds remaining if this key is currently blocked, otherwise null.
function checkLoginRateLimit(key) {
  const rec = loginAttempts.get(key);
  if (!rec) return null;
  if (rec.blockedUntil && Date.now() < rec.blockedUntil) {
    return Math.ceil((rec.blockedUntil - Date.now()) / 1000);
  }
  if (rec.blockedUntil && Date.now() >= rec.blockedUntil) {
    loginAttempts.delete(key); // block expired — start fresh
  }
  return null;
}

function recordLoginFailure(key) {
  const now = Date.now();
  let rec = loginAttempts.get(key);
  if (!rec || now - rec.firstAttempt > LOGIN_WINDOW_MS) {
    rec = { count: 0, firstAttempt: now, blockedUntil: null };
  }
  rec.count++;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    rec.blockedUntil = now + LOGIN_WINDOW_MS;
  }
  loginAttempts.set(key, rec);
}

function recordLoginSuccess(key) {
  loginAttempts.delete(key);
}

// Sweep stale entries periodically so this Map doesn't grow unbounded over
// the life of the process. unref() so this timer never keeps the process
// alive on its own.
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of loginAttempts) {
    if ((!rec.blockedUntil || now > rec.blockedUntil) && now - rec.firstAttempt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

// Which side of the login screen's Staff / Parent & Student toggle each
// role belongs to. Purely a "you're on the wrong tab" guardrail, not a
// substitute for the per-route role checks a real authorization layer
// would add — a Teacher who successfully signs in here still gets
// whatever a Teacher session normally gets, same as before this existed.
const STAFF_LOGIN_ROLES = ['Admin', 'Principal', 'Accountant', 'Office Assistant', 'Teacher', 'Staff'];
const PARENT_LOGIN_ROLES = ['Student', 'Parent'];

app.post('/api/login', async (req, res) => {
  try {
    const { username, password, audience } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    const rateKey = loginRateKey(req, username);
    const blockedForSeconds = checkLoginRateLimit(rateKey);
    if (blockedForSeconds) {
      const mins = Math.ceil(blockedForSeconds / 60);
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` });
    }
    const rows = await sql`SELECT * FROM users WHERE LOWER(username) = LOWER(${String(username)})`;
    if (!rows.length) { recordLoginFailure(rateKey); return res.status(401).json({ error: 'Invalid username or password.' }); }
    const user = rows[0];
    const ok = await bcrypt.compare(String(password), user.password || '');
    if (!ok) { recordLoginFailure(rateKey); return res.status(401).json({ error: 'Invalid username or password.' }); }
    // Checked only after the password is already confirmed correct, so this
    // never gives anyone a way to learn an account's role without already
    // knowing its password — at that point they could just switch tabs
    // anyway. Treated as a successful login for rate-limiting purposes
    // (it's a real account with the real password, just the wrong tab).
    if (audience === 'staff' && !STAFF_LOGIN_ROLES.includes(user.role)) {
      recordLoginSuccess(rateKey);
      return res.status(403).json({ error: 'This is a Parent/Student account — switch to the "Parent & Student" tab to sign in.', wrongAudience: true });
    }
    if (audience === 'parent' && !PARENT_LOGIN_ROLES.includes(user.role)) {
      recordLoginSuccess(rateKey);
      return res.status(403).json({ error: 'This is a Staff account — switch to the "Staff" tab to sign in.', wrongAudience: true });
    }
    recordLoginSuccess(rateKey);
    const shaped = simpleToAppShape(user, SIMPLE_RESOURCES.users.fields);
    delete shaped.password;
    await createSession(req, res, user);
    return res.status(200).json(shaped);
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    await destroySession(req, res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('logout error:', err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

// Lets the page ask "am I still logged in, and as whom?" on load/refresh
// instead of trusting a client-side flag — the auth middleware above has
// already rejected this request with 401 if the session cookie is missing
// or expired, so reaching this handler at all means req.authUser is valid.
// Looked up fresh from `users` (not just the id/role/name cached on the
// session row) so a role or name change since login shows up immediately
// on the next page load, same shape /api/login returns.
app.get('/api/me', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM users WHERE id = ${req.authUser.id}`;
    if (!rows.length) return res.status(401).json({ error: 'Account no longer exists.' });
    const shaped = simpleToAppShape(rows[0], SIMPLE_RESOURCES.users.fields);
    delete shaped.password;
    return res.status(200).json(shaped);
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

// ---------- Full data backup/export ----------
// A single admin-triggered dump of every table in the database as plain
// JSON, so there's a real, human-inspectable disaster-recovery copy that
// doesn't depend on remembering to configure anything on Neon's side, and
// that can be opened and read even by someone without database access.
// Reads the table list from Postgres itself (information_schema) rather
// than hardcoding the 24+ tables from ensureSchema — that means a table
// added later (the audit log below, or anything after it) is picked up
// automatically with no risk of someone updating the schema and forgetting
// to update a separate hardcoded backup list. Table names here come from
// Postgres's own catalog, not from any request input, so building the
// SELECT with a template string is safe — there's no user-controlled value
// anywhere in it.
app.get('/api/backup', async (req, res) => {
  try {
    const tableRows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const backup = { generatedAt: new Date().toISOString(), tables: {} };
    for (const row of tableRows) {
      const name = row.table_name;
      backup.tables[name] = await sql.query(`SELECT * FROM "${name}"`);
    }
    const filename = `raghavan-erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).json(backup);
  } catch (err) {
    console.error('backup error:', err);
    return res.status(500).json({ error: 'Could not generate backup.' });
  }
});

// Read-only viewer for the audit log — newest first, capped at 500 rows per
// call so this stays fast and bounded no matter how long the table gets
// (the Admin-only UI reads this straight through, no further pagination
// needed for a log meant for "what changed recently," not full history
// mining).
app.get('/api/audit-log', async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500`;
    return res.status(200).json(rows);
  } catch (err) {
    console.error('audit-log fetch error:', err);
    return res.status(500).json({ error: 'Could not load the audit log.' });
  }
});

// The one write this app accepts from a completely anonymous caller. Every
// other POST/PUT in the app is reached only through the ERP's own UI, used
// by staff who are (for now) trusted the moment they're on the login
// screen — but this one is open to anyone who can reach the public school
// website, logged in or not. A short server-side sanity check here, in
// addition to the 20kb body-size cap above, means a bad actor can't stuff
// oversized or missing-field junk straight into the admissions pipeline.
const ADMISSION_INQUIRY_FIELD_LIMITS = {
  studentName: 120, parentName: 120, parentEmail: 160, parentPhone: 40, applyingGrade: 40, notes: 2000,
};
function validateAdmissionInquiry(body) {
  if (!body || typeof body !== 'object') return 'Invalid submission.';
  // The id is meant to be an opaque token, and index.html's admin view
  // later drops it, unescaped, inside an onclick="...('<id>')" attribute —
  // so anything containing a quote, angle bracket, backtick or backslash is
  // rejected here, since a legitimate auto-generated id never needs one.
  // This is deliberately a blocklist of the dangerous characters rather
  // than an allowlist of an assumed id format, since the public website
  // that generates these ids is a separate project this session can't see
  // the source of — a blocklist can't reject a legitimate historical id
  // whose exact shape isn't known here, while an allowlist could.
  if (!body.id || typeof body.id !== 'string' || body.id.length > 200 || /['"<>`\\]/.test(body.id)) {
    return 'Missing or invalid id.';
  }
  if (!body.parentName || !body.studentName) return 'Parent name and student name are required.';
  for (const [field, max] of Object.entries(ADMISSION_INQUIRY_FIELD_LIMITS)) {
    const v = body[field];
    if (v != null && String(v).length > max) return `${field} is too long.`;
  }
  return null;
}

// ---------- Main API route ----------
// This one route replaces the old api/[resource].js dynamic file — same
// logic, just reading the resource name from Express's route parameter
// (req.params.resource) instead of Vercel's automatic req.query.resource.
app.all('/api/:resource', async (req, res) => {
  const { resource } = req.params;
  // Log every write centrally, right here, instead of inside each of the
  // individual handlers below (handleUsers, handleSimple, handleHybrid,
  // handleSubjects, ...) — one place to get right instead of N, and any
  // future resource added to this dispatcher is covered automatically.
  // Logged from res.on('finish') so this reflects what actually happened:
  // a validation error or a DB failure further down still ends the
  // request with a 4xx/5xx and produces no log entry, same as if the
  // write had never been attempted.
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    // req.authUser now comes from a verified session (see the auth
    // middleware above) for every write except the public, unauthenticated
    // admission-inquiries submission — trust that over the client-supplied
    // x-actor-name/x-actor-role headers whenever it's present, since those
    // headers are just whatever the browser said and were never actually
    // checked against who was logged in.
    const actorName = req.authUser ? req.authUser.name : (decodeHeaderValue(req.headers['x-actor-name']) || '(unknown)');
    const actorRole = req.authUser ? req.authUser.role : (decodeHeaderValue(req.headers['x-actor-role']) || '');
    const recordId = (req.body && req.body.id) || req.query.id || null;
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      sql`INSERT INTO audit_log (actor_name, actor_role, method, resource, record_id)
          VALUES (${actorName}, ${actorRole}, ${req.method}, ${resource}, ${recordId ? String(recordId) : null})`
        .catch(err => console.error('audit log insert failed:', err));
    });
  }
  try {
    // CORS (above) only stops a BROWSER from calling this cross-origin —
    // it does nothing against a direct request from curl, a script, or
    // any other non-browser caller, and this app has no server-side auth
    // yet (see the security review) that would otherwise close that gap.
    // So this check runs for PUT too, not just the POST the public form
    // itself is meant to send.
    if (resource === 'admission-inquiries' && (req.method === 'POST' || req.method === 'PUT')) {
      const validationError = validateAdmissionInquiry(req.body);
      if (validationError) return res.status(400).json({ error: validationError });
    }
    // 'users' is also in SIMPLE_RESOURCES (its column/field list is reused
    // by handleUsers above), but takes its own dedicated handler instead of
    // the generic one because of the password rules described there.
    if (resource === 'users') return await handleUsers(req, res);
    if (SIMPLE_RESOURCES[resource]) return await handleSimple(req, res, SIMPLE_RESOURCES[resource]);
    if (HYBRID_RESOURCES[resource]) return await handleHybrid(req, res, HYBRID_RESOURCES[resource]);
    if (resource === 'subjects') return await handleSubjects(req, res);
    if (resource === 'exam-defs') return await handleExamDefs(req, res);
    if (resource === 'roles') return await handleRoles(req, res);
    if (resource === 'fee-structure') return await handleFeeStructure(req, res);
    if (resource === 'attendance-settings') return await handleAttendanceSettings(req, res);
    if (resource === 'school-info') return await handleSchoolInfo(req, res);
    return res.status(404).json({ error: `Unknown resource: ${resource}` });
  } catch (err) {
    console.error(`${resource} API error:`, err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

// A request body that's still too large (bigger than the 25mb limit above)
// or isn't valid JSON reaches here as an error instead of a route handler.
// Without this, Express's default error page is a raw HTML blob with a 413
// or 400 status — the frontend's fetch calls now check response.ok (see
// index.html), so they need a real JSON body to work with, and a person
// checking the browser's Network tab gets an actual explanation instead of
// a wall of HTML.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That upload is too large. Try a smaller photo or file.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed request.' });
  }
  if (err) {
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
  next();
});

// ---------- Serve the ERP itself ----------
// Put your ERP's index.html (and any other static assets) in the "public"
// folder next to this file — Express serves it directly, same origin as
// the API, so the frontend's existing fetch('/api/...') calls just work.
app.use(express.static(path.join(__dirname, 'public')));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
