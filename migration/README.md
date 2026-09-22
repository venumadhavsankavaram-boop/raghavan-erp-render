# Neon Postgres -> GoDaddy MySQL: one-time data migration

These two scripts turn a Postgres data export from the old Neon database into
something that loads into the new MySQL schema (the one `ensureSchema()` in
`server.js` now creates). Neither script contains any actual data — the data
lives in a separate JSON export file, kept out of git.

## 1. Export the data from Neon

Each of the 15 non-empty tables was exported as JSON with one `json_agg`
query per table, run together in a single transaction (e.g. via the Neon
MCP's `run_sql_transaction`, or `psql`/any Postgres client):

```sql
SELECT COALESCE(json_agg(t), '[]') AS data FROM acct_expenses t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM attendance_settings t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM custom_roles t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM exam_defs t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM exam_room_config t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM fee_structure t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM holidays t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM kv_store t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM purge_log t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM school_info t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM staff t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM subjects t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM users t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM website_gallery t;
SELECT COALESCE(json_agg(t), '[]') AS data FROM wipe_log t;
```

Save the combined result as a single JSON file: an array of 15 entries (one
per statement, in the order above), each shaped like `[{ "data": [...] }]`.

If any *other* table has picked up rows since this export was taken (e.g.
`students`, `payments`, `attendance_records` were all empty at export time),
add a query for it in the same order and extend `TABLES_IN_ORDER` /
`DATETIME_COLUMNS` in both scripts below to match.

## 2. Turn it into a MySQL .sql file

```
node migration/export_sql_dump.mjs <neon-export.json> <output.sql>
```

Produces a plain `DELETE FROM ...; INSERT INTO ...;` dump (data only — no
`CREATE TABLE`s, since the app's own `ensureSchema()` already creates those
on first boot). This is what gets uploaded through GoDaddy's own **Import
SQL** feature (Settings -> Hosted Database), *after* the app has deployed
there at least once.

## 3. Or import directly (used for local testing against MariaDB/MySQL)

```
DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
  node migration/import_neon_data.mjs <neon-export.json>
```

Both scripts:
- Clear each target table before loading (safe to re-run; also handles the
  app's first-boot auto-seeded admin account colliding on `id = 'u_admin'`
  with the real one in the export).
- Convert Postgres's `timestamptz` text (`...+00:00`) to MySQL `DATETIME`
  literals.
- JSON-stringify the columns MySQL stores as JSON/LONGTEXT (see
  `JSON_COLUMNS` in `db.js`).
- Print only row counts, never row contents — the export file can contain
  staff/user PII and should never be committed to git or pasted anywhere.
