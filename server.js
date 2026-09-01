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
}
await ensureSchema();

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
      { app: 'amount', col: 'amount' }, { app: 'discount', col: 'discount' }, { app: 'instalment', col: 'instalment' },
      { app: 'date', col: 'date' }, { app: 'note', col: 'note' }, { app: 'classAtPayment', col: 'class_at_payment' },
      { app: 'extraFeeName', col: 'extra_fee_name' }, { app: 'extraFeeId', col: 'extra_fee_id' },
    ],
  },
  discounts: {
    table: 'student_discounts',
    fields: [
      { app: 'id', col: 'id' }, { app: 'batchId', col: 'batch_id' }, { app: 'studentId', col: 'student_id' },
      { app: 'type', col: 'type' }, { app: 'appliesTo', col: 'applies_to' }, { app: 'mode', col: 'mode' },
      { app: 'value', col: 'value' }, { app: 'note', col: 'note' }, { app: 'status', col: 'status' },
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
      { app: 'amount', col: 'amount' }, { app: 'paid', col: 'paid' }, { app: 'paidAmount', col: 'paid_amount' },
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
      { app: 'subject', col: 'subject' }, { app: 'marks', col: 'marks' }, { app: 'absent', col: 'absent' },
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
function simpleToAppShape(row, fields) {
  const out = {};
  fields.forEach(f => {
    let v = row[f.col];
    if (v && typeof v === 'object' && v instanceof Date) v = v.toISOString().slice(0, 10);
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

// ---------- Main API route ----------
// This one route replaces the old api/[resource].js dynamic file — same
// logic, just reading the resource name from Express's route parameter
// (req.params.resource) instead of Vercel's automatic req.query.resource.
app.all('/api/:resource', async (req, res) => {
  const { resource } = req.params;
  try {
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
