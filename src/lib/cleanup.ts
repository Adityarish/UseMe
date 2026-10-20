import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { attachments, clips, oneTimeSessions, rateLimits, uploadSessions } from "@/db/schema";
import { db } from "@/db/client";
import { storage } from "./storage";

export async function cleanupExpired(now = new Date()): Promise<{ clips: number; filesDeleted: number; filesFailed: number }> {
  await db.delete(oneTimeSessions).where(lt(oneTimeSessions.expiresAt, now));
  await db.delete(rateLimits).where(lt(rateLimits.expiresAt, now));
  await db.update(uploadSessions).set({ status: "EXPIRED" })
    .where(and(eq(uploadSessions.status, "OPEN"), lt(uploadSessions.expiresAt, now)));

  const candidates = await db.select({ id: clips.id }).from(clips).where(and(
    or(eq(clips.status, "ACTIVE"), eq(clips.status, "UPLOADING")),
    or(
      lt(clips.expiresAt, now),
      and(eq(clips.expiryMode, "ONCE"), sqlConsumedWithoutSession(now)),
      and(
        eq(clips.status, "UPLOADING"),
        isNull(clips.textContent),
        lt(clips.createdAt, new Date(now.getTime() - 2 * 60 * 60_000)),
      ),
    ),
  )).limit(200);
  const ids = candidates.map((item) => item.id);
  if (ids.length) await db.update(clips).set({ status: "DELETED", textContent: null, updatedAt: now }).where(inArray(clips.id, ids));
  const files = ids.length
    ? await db.select().from(attachments).where(or(
        and(inArray(attachments.clipId, ids), inArray(attachments.status, ["READY", "PENDING", "DELETE_FAILED"])),
        eq(attachments.status, "DELETE_FAILED"),
      )).limit(500)
    : await db.select().from(attachments).where(eq(attachments.status, "DELETE_FAILED")).limit(500);
  let filesDeleted = 0;
  let filesFailed = 0;
  for (const file of files) {
    try {
      if (file.storageObjectId) await storage().delete(file.storageObjectId);
      else await storage().deleteUncommitted(file.clipId, file.id);
      await db.update(attachments).set({ status: "DELETED", storageObjectId: null }).where(eq(attachments.id, file.id));
      filesDeleted += 1;
    } catch (error) {
      console.error("Storage cleanup failed", { attachmentId: file.id, error });
      await db.update(attachments).set({ status: "DELETE_FAILED" }).where(eq(attachments.id, file.id));
      filesFailed += 1;
    }
  }
  return { clips: ids.length, filesDeleted, filesFailed };
}

function sqlConsumedWithoutSession(now: Date) {
  return sql<boolean>`${clips.oneTimeConsumedAt} IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ${oneTimeSessions}
    WHERE ${oneTimeSessions.clipId} = ${clips.id}
      AND ${oneTimeSessions.expiresAt} > ${sql.param(now, oneTimeSessions.expiresAt)}
  )`;
}
