CREATE TYPE "report_status" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED', 'ACTIONED');

ALTER TABLE "abuse_reports"
  ADD COLUMN "status" report_status NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "reviewed_at" timestamptz,
  ADD COLUMN "reviewed_by_user_id" text;

CREATE INDEX "abuse_reports_status_created_idx"
  ON "abuse_reports" ("status", "created_at" DESC, "id" DESC);

REVOKE ALL ON TABLE public.abuse_reports FROM anon, authenticated;
