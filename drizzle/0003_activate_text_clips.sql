UPDATE "clips"
SET "status" = 'ACTIVE', "updated_at" = now()
WHERE "status" = 'UPLOADING'
  AND NULLIF(BTRIM("text_content"), '') IS NOT NULL
  AND ("expires_at" IS NULL OR "expires_at" > now())
RETURNING "id";
