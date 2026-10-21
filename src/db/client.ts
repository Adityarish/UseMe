import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sqlClient?: ReturnType<typeof postgres> };
const databaseUrl = env().DATABASE_URL;
const isManagedDatabase = /(?:supabase\.com|supabase\.co|pooler\.supabase)/.test(databaseUrl);

export const sqlClient = globalForDb.sqlClient ?? postgres(databaseUrl, {
  max: process.env.NODE_ENV === "production" ? 1 : 3,
  // Supabase's transaction pooler does not support session-scoped prepared
  // statements. Disable them for every Supabase endpoint, including local dev.
  prepare: !isManagedDatabase && process.env.NODE_ENV !== "production",
  ssl: isManagedDatabase ? "require" : undefined,
  idle_timeout: 20,
  connect_timeout: 10,
});

if (process.env.NODE_ENV !== "production") globalForDb.sqlClient = sqlClient;

export const db = drizzle(sqlClient, { schema });
