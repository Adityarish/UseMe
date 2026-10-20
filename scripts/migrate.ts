import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required");

const sql = postgres(url, { max: 1 });
try {
  const migration = await readFile(path.join(process.cwd(), "drizzle/0000_initial.sql"), "utf8");
  const authMigration = await readFile(path.join(process.cwd(), "drizzle/0001_supabase_auth.sql"), "utf8");
  const reusableSlugsMigration = await readFile(path.join(process.cwd(), "drizzle/0002_reusable_slugs.sql"), "utf8");
  const activateTextClipsMigration = await readFile(path.join(process.cwd(), "drizzle/0003_activate_text_clips.sql"), "utf8");
  let applied = false;
  let authApplied = false;
  let reusableSlugsApplied = false;
  let activatedTextClips = 0;
  await sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext('useme-initial-migration'))`;
    const [state] = await transaction<{
      profiles: string | null;
      clips: string | null;
      attachments: string | null;
      oneTimeSessions: string | null;
      uploadSessions: string | null;
      rateLimits: string | null;
      abuseReports: string | null;
    }[]>`
      select
        to_regclass('public.profiles')::text as profiles,
        to_regclass('public.clips')::text as clips,
        to_regclass('public.attachments')::text as attachments,
        to_regclass('public.one_time_sessions')::text as "oneTimeSessions",
        to_regclass('public.upload_sessions')::text as "uploadSessions",
        to_regclass('public.rate_limits')::text as "rateLimits",
        to_regclass('public.abuse_reports')::text as "abuseReports"
    `;
    const tableState = state ? Object.values(state) : [];
    if (tableState.length > 0 && tableState.every(Boolean)) return;
    if (tableState.some(Boolean)) {
      throw new Error("Database is partially initialized; refusing to reapply the initial migration");
    }
    await transaction.unsafe(migration);
    applied = true;
  });
  await sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext('useme-supabase-auth-migration'))`;
    const columns = await transaction<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name in ('clerk_user_id', 'user_id')
    `;
    if (columns.some((column) => column.column_name === "user_id")) return;
    if (!columns.some((column) => column.column_name === "clerk_user_id")) {
      throw new Error("The profiles table is missing its user ID column");
    }
    await transaction.unsafe(authMigration);
    authApplied = true;
  });
  await sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext('useme-reusable-slugs-migration'))`;
    const [indexes] = await transaction<{ live_exists: boolean; old_exists: boolean }[]>`
      select
        to_regclass('public.clips_slug_live_unique') is not null as live_exists,
        to_regclass('public.clips_slug_unique') is not null as old_exists
    `;
    if (indexes?.live_exists && !indexes.old_exists) return;
    await transaction.unsafe(reusableSlugsMigration);
    reusableSlugsApplied = true;
  });
  await sql.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtext('useme-activate-text-clips-migration'))`;
    const activated = await transaction.unsafe<{ id: string }[]>(activateTextClipsMigration);
    activatedTextClips = activated.length;
  });
  console.log(applied ? "Applied drizzle/0000_initial.sql" : "Database is already initialized");
  console.log(authApplied ? "Applied drizzle/0001_supabase_auth.sql" : "Supabase auth migration is already applied");
  console.log(reusableSlugsApplied ? "Applied drizzle/0002_reusable_slugs.sql" : "Reusable-slug migration is already applied");
  console.log(activatedTextClips
    ? `Activated ${activatedTextClips} existing text clip${activatedTextClips === 1 ? "" : "s"}`
    : "Existing text clips are already active");
} finally {
  await sql.end();
}
