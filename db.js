// db.js — MySQL-backed drop-in replacement for @neondatabase/serverless's `sql`.
//
// This exists so the 200+ `await sql\`...\`` / `await sql.query(text, params)`
// call sites throughout server.js — written against Neon's Postgres driver —
// don't all need to be hand-rewritten to talk to MySQL. Only this file knows
// the database underneath is now GoDaddy's MySQL, not Neon's Postgres.
//
// What this shim does NOT paper over: actual Postgres-only SQL syntax
// (ON CONFLICT, RETURNING, the ->> JSON operator, NULLS LAST) still had to be
// rewritten by hand at each of those specific call sites — see the migration
// notes in ensureSchema() and the handful of routes that use
// nextDocSeq()/insertNotificationEventIfNew() below instead of plain sql``.
import mysql from 'mysql2/promise';

// Columns that hold a JSON payload (as either a real MySQL JSON column, or —
// when testing against MariaDB, which has no native JSON type — a LONGTEXT
// column with a JSON check constraint). mysql2 only auto-parses a true MySQL
// JSON column; naming them explicitly here means reads come back as real
// objects/arrays either way, matching what this app always got from Neon's
// jsonb columns.
const JSON_COLUMNS = new Set([
  'extra', 'value', 'data', 'details', 'snapshot', 'counts',
  'sections', 'section_staff', 'staff_ids', 'class_subjects',
  'permissions', 'working_days', 'attachments',
]);

function typeCast(field, next) {
  if (JSON_COLUMNS.has(field.name)) {
    const raw = field.string();
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return next();
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  maxIdle: 5,
  idleTimeout: 60000,
  typeCast,
});

// Postgres cast syntax (`::jsonb`, `::int`, ...) has no MySQL equivalent and
// isn't needed there — a JSON column accepts a plain JSON string on write,
// and COUNT(*) is already numeric. Strip any `::word` cast out of the literal
// (non-interpolated) parts of a query before it reaches MySQL.
function stripPgCasts(text) {
  return text.replace(/::\w+/g, '');
}

// The app builds timestamps throughout with `new Date().toISOString()` (or
// stores one straight from request bodies) — Neon's Postgres driver accepted
// that ISO-8601 string ('2026-09-22T11:05:56.508Z') into a TIMESTAMPTZ column
// as-is, but MySQL's DATETIME columns reject the literal 'T'/'Z' characters
// outright (ER_TRUNCATED_WRONG_VALUE). Rather than hunt down and rewrite every
// call site that passes a timestamp, every query parameter is passed through
// this converter: an ISO-8601 string becomes 'YYYY-MM-DD HH:MM:SS[.ffffff]'
// (still UTC wall-clock — DATETIME has no timezone of its own, matching how
// this schema stores every other timestamp), and anything else passes through
// unchanged.
const ISO_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/;
function coerceParam(value) {
  if (typeof value === 'string') {
    const m = ISO_DATETIME_RE.exec(value);
    if (m) return `${m[1]} ${m[2]}${m[3] || ''}`;
  }
  return value;
}
function coerceParams(values) {
  return values.map(coerceParam);
}

// Mimics `sql\`...\``: turns template placeholders into MySQL `?` params and
// runs the query, always returning a plain array (matching what every
// `await sql\`...\`` call site here already expects — for a statement with no
// rows to return, that's an empty array, same as a non-RETURNING Postgres
// statement would give).
export async function sql(strings, ...values) {
  let text = stripPgCasts(strings[0]);
  for (let i = 0; i < values.length; i++) {
    text += '?' + stripPgCasts(strings[i + 1]);
  }
  const [rows] = await pool.query(text, coerceParams(values));
  return Array.isArray(rows) ? rows : [];
}

// Mimics `sql.query(text, params)` (used where the table name itself is
// interpolated — see migrateAccountingFromKv's comment on why the tagged-
// template form can't do that). Converts Postgres's $1/$2-style positional
// placeholders to MySQL's `?`, honoring any placeholder that's reused or out
// of order (a naive global replace would desync the params array).
sql.query = async function (text, params = []) {
  const newParams = [];
  const converted = stripPgCasts(text).replace(/\$(\d+)/g, (_, n) => {
    newParams.push(params[Number(n) - 1]);
    return '?';
  });
  const [rows] = await pool.query(converted, coerceParams(newParams));
  return Array.isArray(rows) ? rows : [];
};

// ---- The handful of sites that used Postgres-only ON CONFLICT ... RETURNING
// and can't be expressed as a plain sql`` call ----

// Atomically issues the next sequence number for a (series, period) counter —
// replaces:
//   INSERT ... ON CONFLICT (series, period) DO UPDATE SET next_seq = next_seq + 1
//   RETURNING next_seq
// MySQL has no RETURNING, so this uses the standard LAST_INSERT_ID(expr)
// idiom instead: wrapping the value in LAST_INSERT_ID(...) on BOTH the
// initial insert and the update branch sets the session's last-insert-id to
// that value even though this table has no AUTO_INCREMENT column, so a
// follow-up SELECT LAST_INSERT_ID() on the same connection reads it back.
// Doing the insert/update and the read on one checked-out connection (rather
// than through the pool, which could hand the next query to a different
// connection) is what keeps this correct.
export async function nextDocSeq(series, period) {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO doc_counters (series, period, next_seq) VALUES (?, ?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE next_seq = LAST_INSERT_ID(next_seq + 1)`,
      [series, period]
    );
    const [[row]] = await conn.query('SELECT LAST_INSERT_ID() AS seq');
    return Number(row.seq);
  } finally {
    conn.release();
  }
}

// Inserts a notification_events row unless one already exists for this
// (student_id, kind, ref_key) — replaces:
//   INSERT ... ON CONFLICT DO NOTHING RETURNING id
// Every call site only ever checked whether that array came back empty (i.e.
// "was this a duplicate?"), never the id itself, so affectedRows from
// INSERT IGNORE (0 if the unique constraint silently skipped the row, 1 if it
// actually inserted) gives the same answer without needing RETURNING.
export async function insertNotificationEventIfNew(studentId, kind, refKey) {
  const [result] = await pool.query(
    'INSERT IGNORE INTO notification_events (student_id, kind, ref_key) VALUES (?, ?, ?)',
    [studentId, kind, refKey]
  );
  return result.affectedRows > 0;
}

// ---- Idempotent-boot helpers for ensureSchema() ----
// MySQL's `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and
// `CREATE INDEX IF NOT EXISTS` aren't reliably supported across every
// MySQL/MariaDB version, unlike Postgres where the original code relied on
// both unconditionally. These swallow the "already exists" error instead, so
// ensureSchema() stays just as safe to run on every boot.
export async function addColumnIfMissing(table, columnDef) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

export async function createIndexIfMissing(indexName, table, columnsExpr) {
  try {
    await pool.query(`CREATE INDEX ${indexName} ON ${table} (${columnsExpr})`);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }
}

export async function closePool() {
  await pool.end();
}
