import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "./pool.js";

const migrationDir = join(process.cwd(), "db", "migrations");
await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
const applied = new Set((await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((row) => row.name));
for (const name of (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort()) {
  if (applied.has(name)) continue;
  const client = await pool.connect();
  try { await client.query("BEGIN"); await client.query(await readFile(join(migrationDir, name), "utf8")); await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]); await client.query("COMMIT"); console.log(`Applied ${name}`); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
await pool.end();
