// One-time data migration: reads the Neon Postgres export (JSON, captured via
// mcp__Neon__run_sql_transaction's json_agg output) and loads it into the
// MySQL schema created by ensureSchema(). Prints only row counts / errors —
// never the actual row data — to keep this script's own console output free
// of student/staff PII.
import fs from 'fs';
import mysql from 'mysql2/promise';

const SOURCE_FILE = process.argv[2];
if (!SOURCE_FILE) { console.error('Usage: node import_neon_data.mjs <path-to-neon-export.json>'); process.exit(1); }

// Table export order must match the order of statements in the Neon export
// (see the run_sql_transaction call this file was captured from).
const TABLES_IN_ORDER = [
  'acct_expenses', 'attendance_settings', 'custom_roles', 'exam_defs',
  'exam_room_config', 'fee_structure', 'holidays', 'kv_store', 'purge_log',
  'school_info', 'staff', 'subjects', 'users', 'website_gallery', 'wipe_log',
];

// Columns that hold a JSON payload as MySQL LONGTEXT (see db.js's JSON_COLUMNS)
// — these need JSON.stringify(), not the raw JS value, when inserted.
const JSON_COLUMNS = new Set([
  'extra', 'value', 'data', 'details', 'snapshot', 'counts',
  'sections', 'section_staff', 'staff_ids', 'class_subjects',
  'permissions', 'working_days', 'attachments',
]);

// Columns whose MySQL type is DATETIME, per table (from ensureSchema/DESCRIBE)
// — Postgres returns timestamptz values as e.g. "2026-09-22T05:08:37.385815+00:00",
// which MySQL's DATETIME rejects outright, same as the 'Z'-suffixed strings
// db.js's coerceParam already handles for the app's own live writes. This
// one-time import needs its own (more permissive) parser since Postgres's
// COPY/json_agg output uses a numeric UTC offset, not 'Z'.
const DATETIME_COLUMNS = {
  acct_expenses: ['voided_at', 'created_at'],
  attendance_settings: [],
  custom_roles: ['created_at'],
  exam_defs: ['created_at'],
  exam_room_config: ['created_at'],
  fee_structure: [],
  holidays: ['created_at'],
  kv_store: ['updated_at'],
  purge_log: ['deleted_at', 'purged_at'],
  school_info: [],
  staff: ['created_at'],
  subjects: ['created_at'],
  users: ['created_at', 'deleted_at'],
  website_gallery: ['created_at'],
  wipe_log: ['wiped_at'],
};

function toMysqlDatetime(value) {
  if (value === null || value === undefined) return null;
  // "2026-09-22T05:08:37.385815+00:00" / "...Z" / "...+05:30" -> "2026-09-22 05:08:37.385815"
  // (converts to UTC wall-clock first if the offset isn't already +00:00)
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
         (d.getUTCMilliseconds() ? `.${pad(d.getUTCMilliseconds(), 3)}000` : '');
}

async function main() {
  const raw = fs.readFileSync(SOURCE_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 3,
  });

  let totalRows = 0;
  const summary = [];
  for (let i = 0; i < TABLES_IN_ORDER.length; i++) {
    const table = TABLES_IN_ORDER[i];
    const rows = parsed[i][0].data;
    const dtCols = new Set(DATETIME_COLUMNS[table] || []);
    // The app auto-seeds a few rows on its very first boot (a default admin
    // user in particular — id 'u_admin', same id the real exported data
    // uses), so every target table is cleared first: this import is meant to
    // fully replace that first-boot placeholder state, and clearing makes
    // the script safe to re-run.
    await pool.query(`DELETE FROM \`${table}\``);
    let inserted = 0;
    for (const row of rows) {
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(', ');
      const colList = cols.map(c => `\`${c}\``).join(', ');
      const values = cols.map(c => {
        let v = row[c];
        if (dtCols.has(c)) return toMysqlDatetime(v);
        if (JSON_COLUMNS.has(c) && v !== null && typeof v === 'object') return JSON.stringify(v);
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v;
      });
      await pool.query(`INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`, values);
      inserted++;
    }
    summary.push(`${table}: ${inserted} row(s)`);
    totalRows += inserted;
  }
  console.log(summary.join('\n'));
  console.log(`\nTotal: ${totalRows} rows imported.`);
  await pool.end();
}

main().catch(err => { console.error('IMPORT FAILED:', err.message, err.sqlMessage || ''); process.exit(1); });
