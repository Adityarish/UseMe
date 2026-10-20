DROP INDEX IF EXISTS "clips_slug_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "clips_slug_live_unique"
  ON "clips" ("slug")
  WHERE "status" IN ('UPLOADING', 'ACTIVE');
