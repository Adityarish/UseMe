import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLogs } from "@/db/schema";
import { ApiError } from "./http";

const PAGE_SIZE = 10;

type ActivityCursor = { createdAt: string; id: number };

function decodeCursor(value: string): ActivityCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ActivityCursor>;
    const createdAt = new Date(parsed.createdAt ?? "");
    if (Number.isNaN(createdAt.getTime()) || !Number.isSafeInteger(parsed.id) || Number(parsed.id) < 1) throw new Error();
    return { createdAt: createdAt.toISOString(), id: Number(parsed.id) };
  } catch {
    throw new ApiError(400, "The activity cursor is invalid.", "INVALID_CURSOR");
  }
}

function encodeCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export async function userActivity(userId: string, cursorValue?: string | null) {
  const cursor = cursorValue ? decodeCursor(cursorValue) : null;
  const cursorDate = cursor ? new Date(cursor.createdAt) : null;
  const where = cursor && cursorDate
    ? and(
        eq(activityLogs.userId, userId),
        or(
          lt(activityLogs.createdAt, cursorDate),
          and(eq(activityLogs.createdAt, cursorDate), lt(activityLogs.id, cursor.id)),
        ),
      )
    : eq(activityLogs.userId, userId);

  const rows = await db.select({
    id: activityLogs.id,
    action: activityLogs.action,
    slug: activityLogs.slug,
    detail: activityLogs.detail,
    createdAt: activityLogs.createdAt,
  }).from(activityLogs)
    .where(where)
    .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}
