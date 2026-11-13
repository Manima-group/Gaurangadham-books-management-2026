import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

// App traffic uses DATABASE_URL. On Neon this is the pooled (-pooler) string:
// PgBouncer transaction mode, so no prepared statements and only
// transaction-scoped advisory locks (pg_advisory_xact_lock) — which is all we use.
const serverless = !!process.env.VERCEL;
const client =
  globalForDb.pg ??
  postgres(process.env.DATABASE_URL!, {
    max: Number(process.env.DB_POOL_MAX) || (serverless ? 5 : 10),
    prepare: false,
    idle_timeout: serverless ? 20 : 0, // free idle connections so Neon can scale to zero
    connect_timeout: 15, // Neon may need a moment to wake from idle
    connection: { TimeZone: "Asia/Kolkata" }, // Neon runs in UTC; keep SQL dates in IST like the app
  });

// Reuse one pool per process (dev hot-reload and warm serverless instances).
globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
