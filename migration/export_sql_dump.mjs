// Turns the Neon Postgres export (same JSON source as import_neon_data.mjs)
// into a plain .sql file of DELETE + INSERT statements, ready to hand to
// GoDaddy's "Import SQL" upload feature (Settings -> Hosted Database) once
// the app has deployed there and ensureSchema() has created the tables.
// Data-only by design — the schema is already created by the app itself on
// first boot, so this only needs to repopulate it.
import fs from 'fs';
import mysql from 'mysql2';

const SOURCE_FILE = process.argv[2];
const OUT_FILE = process.argv[3];
if (!SOURCE_FILE || !OUT_FILE) {
  console.error('Usage: node export_sql_dump.mjs <neon-export.json> <output.sql>');
  process.exit(1);
}

const TABLES_IN_ORDER = [
  'acct_expenses', 'attendance_settings', 'custom_roles', 'exam_defs',
  'exam_room_config', 'fee_structure', 'holidays', 'kv_store', 'purge_log',
  'school_info', 'staff', 'subjects', 'users', 'website_gallery', 'wipe_log',
];
const JSON_COLUMNS = new Set([
  'extra', 'value', 'data', 'details', 'snapshot', 'counts',
  'sections', 'section_staff', 'staff_ids', 'class_subjects',
  'permissions', 'working_days', 'attachments',
]);
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
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
         (d.getUTCMilliseconds() ? `.${pad(d.getUTCMilliseconds(), 3)}000` : '');
}

const raw = fs.readFileSync(SOURCE_FILE, 'utf8');
const parsed = JSON.parse(raw);

const out = fs.createWriteStream(OUT_FILE, { encoding: 'utf8' });
out.write('-- Data-only import: raghavan-erp-render, Neon Postgres -> GoDaddy MySQL\n');
out.write('-- Generated ' + new Date().toISOString() + '\n');
out.write('-- Run this only AFTER the app has deployed and created its schema (ensureSchema()).\n\n');
out.write('SET FOREIGN_KEY_CHECKS=0;\n\n');

let totalRows = 0;
for (let i = 0; i < TABLES_IN_ORDER.length; i++) {
  const table = TABLES_IN_ORDER[i];
  const rows = parsed[i][0].data;
  const dtCols = new Set(DATETIME_COLUMNS[table] || []);
  out.write(`-- ---- ${table} (${rows.length} row(s)) ----\n`);
  out.write(`DELETE FROM \`${table}\`;\n`);
  for (const row of rows) {
    const cols = Object.keys(row);
    const colList = cols.map(c => `\`${c}\``).join(', ');
    const values = cols.map(c => {
      let v = row[c];
      if (dtCols.has(c)) v = toMysqlDatetime(v);
      else if (JSON_COLUMNS.has(c) && v !== null && typeof v === 'object') v = JSON.stringify(v);
      else if (typeof v === 'boolean') v = v ? 1 : 0;
      return mysql.escape(v);
    });
    out.write(`INSERT INTO \`${table}\` (${colList}) VALUES (${values.join(', ')});\n`);
    totalRows++;
  }
  out.write('\n');
}
out.write('SET FOREIGN_KEY_CHECKS=1;\n');
out.end();
out.on('finish', () => {
  console.log(`Wrote ${totalRows} row(s) across ${TABLES_IN_ORDER.length} tables to ${OUT_FILE}`);
});
