CREATE TYPE "activity_action" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'FILES_ADDED', 'FILE_REMOVED');

CREATE TABLE "activity_logs" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "profiles"("user_id") ON DELETE CASCADE,
  "clip_id" uuid REFERENCES "clips"("id") ON DELETE SET NULL,
  "action" activity_action NOT NULL,
  "slug" text NOT NULL,
  "detail" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "activity_logs_slug_not_blank" CHECK (char_length(btrim("slug")) > 0)
);

CREATE INDEX "activity_logs_user_created_idx"
  ON "activity_logs" ("user_id", "created_at" DESC, "id" DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.activity_logs FROM anon, authenticated;
GRANT SELECT ON TABLE public.activity_logs TO authenticated;

CREATE POLICY "Users can read their own activity"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid())::text = user_id);
