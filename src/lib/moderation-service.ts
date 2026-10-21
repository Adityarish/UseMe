import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { abuseReports, activityLogs, attachments, clips } from "@/db/schema";
import { ApiError } from "./http";

export async function openReportCount(): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` })
    .from(abuseReports)
    .where(eq(abuseReports.status, "OPEN"));
  return Number(rows[0]?.count ?? 0);
}

export async function recentReports() {
  const rows = await db.select({
    id: abuseReports.id,
    reason: abuseReports.reason,
    status: abuseReports.status,
    createdAt: abuseReports.createdAt,
    reviewedAt: abuseReports.reviewedAt,
    slug: clips.slug,
    clipStatus: clips.status,
    textContent: clips.textContent,
  }).from(abuseReports)
    .innerJoin(clips, eq(clips.id, abuseReports.clipId))
    .orderBy(desc(abuseReports.createdAt), desc(abuseReports.id))
    .limit(100);

  return rows.map((row) => ({
    ...row,
    textPreview: row.textContent?.slice(0, 2_000) ?? null,
    textContent: undefined,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }));
}

export async function moderateReport(
  reportId: string,
  action: "review" | "dismiss" | "delete",
  adminUserId: string,
) {
  const rows = await db.select({
    reportId: abuseReports.id,
    clipId: clips.id,
    slug: clips.slug,
    clipStatus: clips.status,
    ownerUserId: clips.ownerUserId,
  }).from(abuseReports)
    .innerJoin(clips, eq(clips.id, abuseReports.clipId))
    .where(eq(abuseReports.id, reportId))
    .limit(1);
  const target = rows[0];
  if (!target) throw new ApiError(404, "Report not found.", "REPORT_NOT_FOUND");

  if (action !== "delete") {
    const status = action === "review" ? "REVIEWED" as const : "DISMISSED" as const;
    await db.update(abuseReports).set({ status, reviewedAt: new Date(), reviewedByUserId: adminUserId })
      .where(eq(abuseReports.id, reportId));
    return { status, deleted: false };
  }

  const files = await db.transaction(async (tx) => {
    const marked = await tx.update(clips).set({ status: "DELETED", textContent: null, updatedAt: new Date() })
      .where(and(eq(clips.id, target.clipId), inArray(clips.status, ["ACTIVE", "UPLOADING"])))
      .returning({ id: clips.id });
    await tx.update(abuseReports).set({ status: "ACTIONED", reviewedAt: new Date(), reviewedByUserId: adminUserId })
      .where(eq(abuseReports.id, reportId));
    if (marked.length && target.ownerUserId) {
      await tx.insert(activityLogs).values({
        userId: target.ownerUserId,
        clipId: target.clipId,
        action: "DELETED",
        slug: target.slug,
        detail: "Removed by an administrator after an abuse report",
      });
    }
    return tx.select().from(attachments).where(and(
      eq(attachments.clipId, target.clipId),
      inArray(attachments.status, ["READY", "PENDING", "DELETE_FAILED"]),
    ));
  });

  const { storage } = await import("./storage");
  let cleanupPending = false;
  for (const file of files) {
    try {
      if (file.storageObjectId) await storage().delete(file.storageObjectId);
      else await storage().deleteUncommitted(file.clipId, file.id);
      await db.update(attachments).set({ status: "DELETED", storageObjectId: null }).where(eq(attachments.id, file.id));
    } catch (error) {
      cleanupPending = true;
      console.error("Admin delete cleanup failed", { attachmentId: file.id, error });
      await db.update(attachments).set({ status: "DELETE_FAILED" }).where(eq(attachments.id, file.id));
    }
  }
  return { status: "ACTIONED" as const, deleted: target.clipStatus !== "DELETED", cleanupPending };
}
