CREATE TYPE "access_policy" AS ENUM ('PUBLIC', 'PASSWORD');
CREATE TYPE "edit_policy" AS ENUM ('NONE', 'PUBLIC', 'PASSWORD');
CREATE TYPE "expiry_mode" AS ENUM ('ONCE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'FOREVER');
CREATE TYPE "clip_status" AS ENUM ('UPLOADING', 'ACTIVE', 'DELETED');
CREATE TYPE "attachment_status" AS ENUM ('PENDING', 'READY', 'QUARANTINED', 'DELETED', 'DELETE_FAILED');
CREATE TYPE "upload_status" AS ENUM ('OPEN', 'COMPLETE', 'EXPIRED', 'FAILED');
CREATE TYPE "upload_purpose" AS ENUM ('CREATE', 'EDIT');

CREATE TABLE "profiles" (
  "clerk_user_id" text PRIMARY KEY,
  "display_name" text,
  "email" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "clips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "owner_user_id" text REFERENCES "profiles"("clerk_user_id") ON DELETE SET NULL,
  "text_content" text,
  "language" text NOT NULL DEFAULT 'plain',
  "view_policy" access_policy NOT NULL DEFAULT 'PUBLIC',
  "view_password_hash" text,
  "edit_policy" edit_policy NOT NULL DEFAULT 'NONE',
  "edit_password_hash" text,
  "expiry_mode" expiry_mode NOT NULL DEFAULT 'DAY',
  "expires_at" timestamptz,
  "one_time_consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "status" clip_status NOT NULL DEFAULT 'UPLOADING',
  CONSTRAINT "clips_password_consistency" CHECK (
    (view_policy = 'PASSWORD') = (view_password_hash IS NOT NULL)
    AND (edit_policy = 'PASSWORD') = (edit_password_hash IS NOT NULL)
  ),
  CONSTRAINT "clips_expiry_consistency" CHECK (
    (expiry_mode = 'FOREVER' AND expires_at IS NULL)
    OR (expiry_mode <> 'FOREVER' AND expires_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "clips_slug_unique" ON "clips" ("slug");
CREATE INDEX "clips_owner_created_idx" ON "clips" ("owner_user_id", "created_at" DESC);
CREATE INDEX "clips_expiry_idx" ON "clips" ("status", "expires_at");

CREATE TABLE "attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clip_id" uuid NOT NULL REFERENCES "clips"("id") ON DELETE CASCADE,
  "original_filename" text NOT NULL,
  "size_bytes" bigint NOT NULL CHECK (size_bytes > 0),
  "mime_type" text NOT NULL,
  "storage_provider" text NOT NULL,
  "storage_object_id" text,
  "status" attachment_status NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "attachments_clip_idx" ON "attachments" ("clip_id");

CREATE TABLE "one_time_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clip_id" uuid NOT NULL REFERENCES "clips"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "one_time_sessions_token_unique" ON "one_time_sessions" ("token_hash");
CREATE INDEX "one_time_sessions_clip_idx" ON "one_time_sessions" ("clip_id");

CREATE TABLE "upload_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clip_id" uuid NOT NULL REFERENCES "clips"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "reserved_bytes" bigint NOT NULL CHECK (reserved_bytes >= 0),
  "purpose" upload_purpose NOT NULL DEFAULT 'CREATE',
  "base_version" integer,
  "status" upload_status NOT NULL DEFAULT 'OPEN',
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "upload_sessions_token_unique" ON "upload_sessions" ("token_hash");
CREATE INDEX "upload_sessions_expiry_idx" ON "upload_sessions" ("status", "expires_at");

CREATE TABLE "rate_limits" (
  "key" text NOT NULL,
  "bucket" timestamptz NOT NULL,
  "hits" integer NOT NULL DEFAULT 1,
  "expires_at" timestamptz NOT NULL,
  PRIMARY KEY ("key", "bucket")
);
CREATE INDEX "rate_limits_expiry_idx" ON "rate_limits" ("expires_at");

CREATE TABLE "abuse_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clip_id" uuid NOT NULL REFERENCES "clips"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "reporter_fingerprint" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "abuse_reports_clip_idx" ON "abuse_reports" ("clip_id", "created_at" DESC);
