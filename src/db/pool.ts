import { Pool, type QueryResultRow } from "pg";
import { config } from "../config.js";
import { logger } from "../logger.js";

export const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, application_name: "autoclip" });
pool.on("error", (err) => logger.error({ error: err.message }, "postgres_pool_error"));
export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> { return (await pool.query<T>(text, values)).rows; }
export async function one<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T | null> { return (await query<T>(text, values))[0] ?? null; }
