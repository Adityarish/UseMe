import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const sql = url ? postgres(url, { max: 4 }) : null;

suite("PostgreSQL concurrency invariants", () => {
  const slug = `test-${randomUUID()}`;
  let clipId = "";
  beforeAll(async () => {
    const rows = await sql!`
      INSERT INTO clips (slug, text_content, expiry_mode, expires_at, status)
      VALUES (${slug}, 'secret', 'ONCE', now() + interval '1 hour', 'ACTIVE')
      RETURNING id
    `;
    clipId = rows[0].id;
  });
  afterAll(async () => {
    if (sql) {
      await sql`DELETE FROM clips WHERE slug = ${slug}`;
      await sql.end();
    }
  });

  it("allows exactly one concurrent one-time claimant", async () => {
    const claim = () => sql!`
      UPDATE clips SET one_time_consumed_at = now()
      WHERE id = ${clipId} AND one_time_consumed_at IS NULL AND status = 'ACTIVE' AND expires_at > now()
      RETURNING id
    `;
    const results = await Promise.all([claim(), claim()]);
    expect(results.map((result) => result.length).sort()).toEqual([0, 1]);
  });

  it("allows a slug to be reused after its previous clip is deleted", async () => {
    await sql!`UPDATE clips SET status = 'DELETED' WHERE id = ${clipId}`;
    const replacement = await sql!`
      INSERT INTO clips (slug, expiry_mode, expires_at, status)
      VALUES (${slug}, 'DAY', now() + interval '1 day', 'ACTIVE')
      RETURNING id
    `;
    expect(replacement).toHaveLength(1);
  });
});
