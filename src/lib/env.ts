import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  ADMIN_EMAILS: z.string().default(""),
  DATABASE_URL: z.string().min(1),
  APP_SECRET: z.string().min(32),
  STORAGE_PROVIDER: z.enum(["local", "google-drive"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default(".local-storage"),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REFRESH_TOKEN: optionalString,
  GOOGLE_DRIVE_ROOT_FOLDER_ID: optionalString,
  MAX_CLIP_BYTES: z.coerce.number().int().positive().default(52_428_800),
  MAX_FILES_PER_CLIP: z.coerce.number().int().min(1).max(100).default(20),
  UPLOAD_SESSION_MINUTES: z.coerce.number().int().positive().default(60),
  ONE_TIME_SESSION_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  ANONYMOUS_MAX_EXPIRY_DAYS: z.coerce.number().int().positive().default(30),
  CLEANUP_SECRET: z.string().min(24),
  TRUSTED_PROXY: z.enum(["true", "false"]).default("false"),
  MALWARE_SCAN_WEBHOOK_URL: optionalUrl,
  MALWARE_SCAN_WEBHOOK_SECRET: optionalString,
});

export type AppEnv = z.infer<typeof schema>;
let cached: AppEnv | undefined;

export function env(): AppEnv {
  if (!cached) {
    const parsed = schema.parse(process.env);
    if (parsed.NODE_ENV === "production" && parsed.STORAGE_PROVIDER === "local") {
      throw new Error("Production requires STORAGE_PROVIDER=google-drive; local disk is not durable.");
    }
    if (Boolean(parsed.NEXT_PUBLIC_SUPABASE_URL) !== Boolean(parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
      throw new Error("Supabase Auth requires both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
    }
    if (parsed.STORAGE_PROVIDER === "google-drive") {
      const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_DRIVE_ROOT_FOLDER_ID"]
        .filter((key) => !parsed[key as keyof AppEnv]);
      if (missing.length) throw new Error(`Missing Google Drive configuration: ${missing.join(", ")}`);
    }
    cached = parsed;
  }
  return cached;
}
