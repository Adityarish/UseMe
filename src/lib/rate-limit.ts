import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { ApiError } from "./http";

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const epoch = Math.floor(Date.now() / 1000);
  const bucketEpoch = epoch - (epoch % windowSeconds);
  const bucket = new Date(bucketEpoch * 1000);
  const expiresAt = new Date((bucketEpoch + windowSeconds * 2) * 1000);
  const [result] = await db
    .insert(rateLimits)
    .values({ key, bucket, hits: 1, expiresAt })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.bucket],
      set: { hits: sql`${rateLimits.hits} + 1` },
    })
    .returning({ hits: rateLimits.hits });

  if (Number(result?.hits ?? 1) > limit) {
    throw new ApiError(429, "Too many requests. Please wait and try again.", "RATE_LIMITED");
  }
}
