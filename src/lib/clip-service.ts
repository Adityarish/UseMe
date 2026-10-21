import { and, asc, desc, eq, gt, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { activityLogs, attachments, clips, oneTimeSessions, profiles, uploadSessions } from "@/db/schema";
import { db } from "@/db/client";
import { env } from "./env";
import { ApiError } from "./http";
import { expiryFor, isUnavailable, safeFilename, validateSlug } from "./domain";
import { createClipSchema, editClipSchema, editUploadSchema } from "./validation";
import {
  editCookieName, hashPassword, oneTimeCookieName, randomToken, signAccessToken, tokenHash,
  verifyAccessToken, verifyPassword, viewCookieName,
} from "./security";
import type { currentIdentity } from "./auth";

type Identity = Awaited<ReturnType<typeof currentIdentity>>;
type CookieBag = Awaited<ReturnType<typeof cookies>>;

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

export async function slugAvailability(rawSlug: string): Promise<{ slug: string; available: boolean }> {
  const slug = validateSlug(rawSlug);
  const now = new Date();
  const found = await db.select({ id: clips.id }).from(clips).where(and(
    eq(clips.slug, slug),
    inArray(clips.status, ["ACTIVE", "UPLOADING"]),
    or(isNull(clips.expiresAt), gt(clips.expiresAt, now)),
  )).limit(1);
  return { slug, available: found.length === 0 };
}

export async function createClip(payload: unknown, identity: Identity) {
  const input = createClipSchema.parse(payload);
  const slug = validateSlug(input.slug);
  const config = env();
  if (input.files.length > config.MAX_FILES_PER_CLIP) throw new ApiError(413, `A clip can contain at most ${config.MAX_FILES_PER_CLIP} files.`, "TOO_MANY_FILES");
  const totalBytes = input.files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > config.MAX_CLIP_BYTES) throw new ApiError(413, "The selected files exceed this clip's upload limit.", "UPLOAD_TOO_LARGE");
  if (!identity && input.expiryMode === "FOREVER") throw new ApiError(403, "Sign in to create a link that lasts forever.", "SIGN_IN_REQUIRED");
  const requestedDays = input.expiryMode === "MONTH" ? 30 : input.expiryMode === "WEEK" ? 7 : input.expiryMode === "DAY" || input.expiryMode === "ONCE" ? 1 : 0;
  if (!identity && requestedDays > config.ANONYMOUS_MAX_EXPIRY_DAYS) throw new ApiError(403, "Sign in to use that expiration period.", "SIGN_IN_REQUIRED");

  const [viewPasswordHash, editPasswordHash] = await Promise.all([
    input.viewPolicy === "PASSWORD" ? hashPassword(input.viewPassword!) : null,
    input.editPolicy === "PASSWORD" ? hashPassword(input.editPassword!) : null,
  ]);
  const uploadToken = input.files.length ? randomToken() : null;

  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`useme-slug:${slug}`}))`);

      // Expired rows become history and no longer reserve the public slug. Any
      // old Drive objects are marked for the existing cleanup worker.
      const retired = await tx.update(clips).set({
        status: "DELETED",
        textContent: null,
        updatedAt: now,
      }).where(and(
        eq(clips.slug, slug),
        inArray(clips.status, ["ACTIVE", "UPLOADING"]),
        lte(clips.expiresAt, now),
      )).returning({ id: clips.id });
      const retiredIds = retired.map((item) => item.id);
      if (retiredIds.length) {
        await tx.update(uploadSessions).set({ status: "EXPIRED" }).where(and(
          inArray(uploadSessions.clipId, retiredIds),
          eq(uploadSessions.status, "OPEN"),
        ));
        await tx.update(attachments).set({ status: "DELETE_FAILED" }).where(and(
          inArray(attachments.clipId, retiredIds),
          inArray(attachments.status, ["READY", "PENDING"]),
        ));
      }

      if (identity) {
        await tx.insert(profiles).values({
          userId: identity.userId,
          displayName: identity.displayName,
          email: identity.email,
        }).onConflictDoUpdate({
          target: profiles.userId,
          set: { displayName: identity.displayName, email: identity.email },
        });
      }
      const [clip] = await tx.insert(clips).values({
        slug,
        ownerUserId: identity?.userId ?? null,
        textContent: input.text || null,
        language: input.language,
        viewPolicy: input.viewPolicy,
        viewPasswordHash,
        editPolicy: input.editPolicy,
        editPasswordHash,
        expiryMode: input.expiryMode,
        expiresAt: expiryFor(input.expiryMode),
        // Text can be read immediately. Attachments remain hidden until each
        // object is safely stored and marked READY.
        status: Boolean(input.text.trim()) || input.files.length === 0 ? "ACTIVE" : "UPLOADING",
      }).returning({ id: clips.id, slug: clips.slug });

      if (identity) {
        await tx.insert(activityLogs).values({
          userId: identity.userId,
          clipId: clip.id,
          action: "CREATED",
          slug: clip.slug,
        });
      }

      const createdAttachments = input.files.length
        ? await tx.insert(attachments).values(input.files.map((file) => ({
            clipId: clip.id,
            originalFilename: safeFilename(file.name),
            sizeBytes: file.size,
            mimeType: file.type || "application/octet-stream",
            storageProvider: config.STORAGE_PROVIDER,
          }))).returning({ id: attachments.id, name: attachments.originalFilename, size: attachments.sizeBytes })
        : [];

      let uploadSession: { id: string; token: string; expiresAt: Date } | null = null;
      if (uploadToken) {
        const expiresAt = new Date(Date.now() + config.UPLOAD_SESSION_MINUTES * 60_000);
        const [session] = await tx.insert(uploadSessions).values({
          clipId: clip.id,
          tokenHash: tokenHash(uploadToken),
          reservedBytes: totalBytes,
          expiresAt,
        }).returning({ id: uploadSessions.id });
        uploadSession = { id: session.id, token: uploadToken, expiresAt };
      }

      return { clip, attachments: createdAttachments, uploadSession };
    });
  } catch (error) {
    if (databaseCode(error) === "23505") throw new ApiError(409, "That name is already in use.", "SLUG_TAKEN");
    throw error;
  }
}

export async function uploadTarget(sessionId: string, attachmentId: string, suppliedToken: string) {
  const result = await db.select({
    session: uploadSessions,
    attachment: attachments,
    clipStatus: clips.status,
  }).from(uploadSessions)
    .innerJoin(clips, eq(clips.id, uploadSessions.clipId))
    .innerJoin(attachments, and(eq(attachments.id, attachmentId), eq(attachments.clipId, uploadSessions.clipId)))
    .where(eq(uploadSessions.id, sessionId)).limit(1);
  const target = result[0];
  if (!target || target.session.tokenHash !== tokenHash(suppliedToken)) throw new ApiError(404, "Upload session not found.", "UPLOAD_NOT_FOUND");
  const validClipStatus = target.session.purpose === "CREATE"
    ? target.clipStatus === "UPLOADING" || target.clipStatus === "ACTIVE"
    : target.clipStatus === "ACTIVE";
  if (target.session.status !== "OPEN" || target.session.expiresAt <= new Date() || !validClipStatus) {
    throw new ApiError(410, "This upload session has expired.", "UPLOAD_EXPIRED");
  }
  if (target.attachment.status !== "PENDING") throw new ApiError(409, "This file was already uploaded.", "ALREADY_UPLOADED");
  return target;
}

export async function completeAttachment(attachmentId: string, objectId: string): Promise<void> {
  const updated = await db.update(attachments).set({ storageObjectId: objectId, status: "READY" })
    .where(and(eq(attachments.id, attachmentId), eq(attachments.status, "PENDING"))).returning({ id: attachments.id });
  if (!updated.length) throw new ApiError(409, "This upload is no longer active.", "UPLOAD_CONFLICT");
}

export async function finalizeUpload(sessionId: string, suppliedToken: string): Promise<{ slug: string }> {
  return db.transaction(async (tx) => {
    const rows = await tx.select({ session: uploadSessions, slug: clips.slug, status: clips.status })
      .from(uploadSessions).innerJoin(clips, eq(clips.id, uploadSessions.clipId))
      .where(eq(uploadSessions.id, sessionId)).limit(1).for("update");
    const row = rows[0];
    if (!row || row.session.tokenHash !== tokenHash(suppliedToken)) throw new ApiError(404, "Upload session not found.", "UPLOAD_NOT_FOUND");
    if (row.session.status === "COMPLETE" && row.status === "ACTIVE") return { slug: row.slug };
    if (row.session.status !== "OPEN" || row.session.expiresAt <= new Date()) throw new ApiError(410, "This upload session has expired.", "UPLOAD_EXPIRED");
    const pending = await tx.select({ id: attachments.id }).from(attachments)
      .where(and(eq(attachments.clipId, row.session.clipId), eq(attachments.status, "PENDING"))).limit(1);
    if (pending.length) throw new ApiError(409, "Finish uploading every file before publishing.", "UPLOAD_INCOMPLETE");
    await tx.update(uploadSessions).set({ status: "COMPLETE" }).where(eq(uploadSessions.id, sessionId));
    if (row.session.purpose === "CREATE") {
      await tx.update(clips).set({ status: "ACTIVE", updatedAt: new Date() }).where(eq(clips.id, row.session.clipId));
    }
    return { slug: row.slug };
  });
}

export async function clipRecord(slug: string) {
  const rows = await db.select().from(clips).where(and(
    eq(clips.slug, slug),
    inArray(clips.status, ["ACTIVE", "UPLOADING"]),
  )).orderBy(desc(clips.createdAt)).limit(1);
  const clip = rows[0];
  if (!clip || isUnavailable(clip)) throw new ApiError(404, "This link has expired or is no longer available.", "CLIP_UNAVAILABLE");
  return clip;
}

async function hasOneTimeSession(clipId: string, cookieBag: CookieBag): Promise<boolean> {
  const raw = cookieBag.get(oneTimeCookieName(clipId))?.value;
  if (!raw) return false;
  const found = await db.select({ id: oneTimeSessions.id }).from(oneTimeSessions)
    .where(and(eq(oneTimeSessions.clipId, clipId), eq(oneTimeSessions.tokenHash, tokenHash(raw)), gt(oneTimeSessions.expiresAt, new Date())))
    .limit(1);
  return found.length > 0;
}

export async function authorizeView(clip: Awaited<ReturnType<typeof clipRecord>>, cookieBag: CookieBag): Promise<"AUTHORIZED" | "PASSWORD" | "REVEAL"> {
  if (clip.expiryMode === "ONCE") {
    if (await hasOneTimeSession(clip.id, cookieBag)) return "AUTHORIZED";
    if (clip.oneTimeConsumedAt) throw new ApiError(404, "This link has expired or is no longer available.", "CLIP_UNAVAILABLE");
  }
  if (clip.viewPolicy === "PASSWORD" && !verifyAccessToken(cookieBag.get(viewCookieName(clip.id))?.value, clip.id, "view")) return "PASSWORD";
  return clip.expiryMode === "ONCE" ? "REVEAL" : "AUTHORIZED";
}

export async function publicClip(slug: string, cookieBag: CookieBag, identity: Identity = null) {
  const clip = await clipRecord(slug);
  const access = await authorizeView(clip, cookieBag);
  if (access === "PASSWORD") return { access, clip: { slug: clip.slug } };
  if (access === "REVEAL") return { access, clip: { id: clip.id, slug: clip.slug, expiryMode: clip.expiryMode, expiresAt: clip.expiresAt } };
  const files = await db.select({
    id: attachments.id,
    name: attachments.originalFilename,
    size: attachments.sizeBytes,
    mimeType: attachments.mimeType,
  }).from(attachments).where(and(eq(attachments.clipId, clip.id), eq(attachments.status, "READY"))).orderBy(asc(attachments.createdAt));
  return {
    access,
    clip: {
      id: clip.id, slug: clip.slug, text: clip.textContent, language: clip.language,
      expiryMode: clip.expiryMode, expiresAt: clip.expiresAt, version: clip.version, files,
      editAccess: identity?.userId === clip.ownerUserId || clip.editPolicy === "PUBLIC"
        || (clip.editPolicy === "PASSWORD" && verifyAccessToken(cookieBag.get(editCookieName(clip.id))?.value, clip.id, "edit"))
        ? "ALLOWED" as const
        : clip.editPolicy === "PASSWORD" ? "PASSWORD" as const : "NONE" as const,
    },
  };
}

export async function unlockView(slug: string, password: string): Promise<{ clipId: string; token: string; expiresAt: Date }> {
  const clip = await clipRecord(slug);
  if (clip.expiryMode === "ONCE" && clip.oneTimeConsumedAt) throw new ApiError(404, "This link has expired or is no longer available.", "CLIP_UNAVAILABLE");
  if (clip.viewPolicy !== "PASSWORD" || !clip.viewPasswordHash || !(await verifyPassword(clip.viewPasswordHash, password))) {
    throw new ApiError(401, "Incorrect password.", "INCORRECT_PASSWORD");
  }
  const expiresAt = new Date(Math.min(clip.expiresAt?.getTime() ?? Infinity, Date.now() + 60 * 60_000));
  return { clipId: clip.id, token: signAccessToken(clip.id, "view", expiresAt), expiresAt };
}

export async function revealOneTime(slug: string, cookieBag: CookieBag): Promise<{ clipId: string; token: string; expiresAt: Date }> {
  const clip = await clipRecord(slug);
  if (clip.expiryMode !== "ONCE") throw new ApiError(409, "This is not a one-time link.", "NOT_ONE_TIME");
  if (clip.viewPolicy === "PASSWORD" && !verifyAccessToken(cookieBag.get(viewCookieName(clip.id))?.value, clip.id, "view")) {
    throw new ApiError(401, "Unlock this link before revealing it.", "PASSWORD_REQUIRED");
  }
  const rawToken = randomToken();
  const expiresAt = new Date(Date.now() + env().ONE_TIME_SESSION_MINUTES * 60_000);
  return db.transaction(async (tx) => {
    const claimed = await tx.update(clips).set({ oneTimeConsumedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(clips.id, clip.id), eq(clips.status, "ACTIVE"), sql`${clips.oneTimeConsumedAt} IS NULL`, gt(clips.expiresAt, new Date())))
      .returning({ id: clips.id });
    if (!claimed.length) throw new ApiError(409, "This one-time link was already revealed.", "ALREADY_REVEALED");
    await tx.insert(oneTimeSessions).values({ clipId: clip.id, tokenHash: tokenHash(rawToken), expiresAt });
    return { clipId: clip.id, token: rawToken, expiresAt };
  });
}

export async function unlockEdit(slug: string, password: string): Promise<{ clipId: string; token: string; expiresAt: Date }> {
  const clip = await clipRecord(slug);
  if (clip.editPolicy !== "PASSWORD" || !clip.editPasswordHash || !(await verifyPassword(clip.editPasswordHash, password))) {
    throw new ApiError(401, "Incorrect edit password.", "INCORRECT_PASSWORD");
  }
  const expiresAt = new Date(Math.min(clip.expiresAt?.getTime() ?? Infinity, Date.now() + 60 * 60_000));
  return { clipId: clip.id, token: signAccessToken(clip.id, "edit", expiresAt), expiresAt };
}

export async function authorizeEdit(clip: Awaited<ReturnType<typeof clipRecord>>, identity: Identity, cookieBag: CookieBag): Promise<void> {
  if (identity && clip.ownerUserId === identity.userId) return;
  if (clip.editPolicy === "PUBLIC") return;
  if (clip.editPolicy === "PASSWORD" && verifyAccessToken(cookieBag.get(editCookieName(clip.id))?.value, clip.id, "edit")) return;
  throw new ApiError(403, "You do not have permission to edit this clip.", "EDIT_FORBIDDEN");
}

export async function editClip(slug: string, payload: unknown, identity: Identity, cookieBag: CookieBag) {
  const input = editClipSchema.parse(payload);
  const clip = await clipRecord(slug);
  await authorizeEdit(clip, identity, cookieBag);
  return db.transaction(async (tx) => {
    const updated = await tx.update(clips).set({
      textContent: input.text || null,
      language: input.language,
      updatedAt: new Date(),
      version: sql`${clips.version} + 1`,
    }).where(and(eq(clips.id, clip.id), eq(clips.version, input.version), eq(clips.status, "ACTIVE")))
      .returning({ version: clips.version });
    if (!updated.length) throw new ApiError(409, "This clip changed in another session. Refresh before saving again.", "VERSION_CONFLICT");
    if (identity?.userId === clip.ownerUserId) {
      await tx.insert(activityLogs).values({ userId: identity.userId, clipId: clip.id, action: "UPDATED", slug: clip.slug });
    }
    return updated[0];
  });
}

export async function startEditUpload(slug: string, payload: unknown, identity: Identity, cookieBag: CookieBag) {
  const manifest = editUploadSchema.parse(payload);
  if (!manifest.files.length) throw new ApiError(400, "Choose at least one file.", "NO_FILES");
  const clip = await clipRecord(slug);
  await authorizeEdit(clip, identity, cookieBag);
  const config = env();
  if (manifest.files.length > config.MAX_FILES_PER_CLIP) throw new ApiError(413, "Too many files.", "TOO_MANY_FILES");
  const newBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
  const totals = await db.select({ bytes: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::bigint`, count: sql<number>`count(*)::int` })
    .from(attachments).where(and(eq(attachments.clipId, clip.id), eq(attachments.status, "READY")));
  if (Number(totals[0]?.bytes ?? 0) + newBytes > config.MAX_CLIP_BYTES) throw new ApiError(413, "These files exceed the clip's total storage quota.", "UPLOAD_TOO_LARGE");
  if (Number(totals[0]?.count ?? 0) + manifest.files.length > config.MAX_FILES_PER_CLIP) throw new ApiError(413, "These files exceed the clip's file-count limit.", "TOO_MANY_FILES");
  const rawToken = randomToken();

  return db.transaction(async (tx) => {
    const advanced = await tx.update(clips).set({ version: sql`${clips.version} + 1`, updatedAt: new Date() })
      .where(and(eq(clips.id, clip.id), eq(clips.version, manifest.version), eq(clips.status, "ACTIVE")))
      .returning({ version: clips.version });
    if (!advanced.length) throw new ApiError(409, "This clip changed in another session. Refresh before uploading.", "VERSION_CONFLICT");
    const created = await tx.insert(attachments).values(manifest.files.map((file) => ({
      clipId: clip.id, originalFilename: safeFilename(file.name), sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream", storageProvider: config.STORAGE_PROVIDER,
    }))).returning({ id: attachments.id, name: attachments.originalFilename, size: attachments.sizeBytes });
    const expiresAt = new Date(Date.now() + config.UPLOAD_SESSION_MINUTES * 60_000);
    const [session] = await tx.insert(uploadSessions).values({
      clipId: clip.id, tokenHash: tokenHash(rawToken), reservedBytes: newBytes,
      purpose: "EDIT", baseVersion: manifest.version, expiresAt,
    }).returning({ id: uploadSessions.id });
    if (identity?.userId === clip.ownerUserId) {
      await tx.insert(activityLogs).values({
        userId: identity.userId,
        clipId: clip.id,
        action: "FILES_ADDED",
        slug: clip.slug,
        detail: `${manifest.files.length} file${manifest.files.length === 1 ? "" : "s"} added`,
      });
    }
    return { attachments: created, uploadSession: { id: session.id, token: rawToken, expiresAt }, version: advanced[0].version };
  });
}

export async function removeAttachment(slug: string, attachmentId: string, version: number, identity: Identity, cookieBag: CookieBag) {
  const clip = await clipRecord(slug);
  await authorizeEdit(clip, identity, cookieBag);
  const result = await db.transaction(async (tx) => {
    const advanced = await tx.update(clips).set({ version: sql`${clips.version} + 1`, updatedAt: new Date() })
      .where(and(eq(clips.id, clip.id), eq(clips.version, version), eq(clips.status, "ACTIVE")))
      .returning({ version: clips.version });
    if (!advanced.length) throw new ApiError(409, "This clip changed in another session. Refresh before removing a file.", "VERSION_CONFLICT");
    const removed = await tx.update(attachments).set({ status: "DELETED" }).where(and(
      eq(attachments.id, attachmentId), eq(attachments.clipId, clip.id), eq(attachments.status, "READY"),
    )).returning({ id: attachments.id, objectId: attachments.storageObjectId });
    if (!removed.length) throw new ApiError(404, "Attachment not found.", "FILE_NOT_FOUND");
    if (identity?.userId === clip.ownerUserId) {
      await tx.insert(activityLogs).values({ userId: identity.userId, clipId: clip.id, action: "FILE_REMOVED", slug: clip.slug });
    }
    return { version: advanced[0].version, file: removed[0] };
  });
  if (!result.file.objectId) return { version: result.version, cleanupPending: false };
  try {
    const { storage } = await import("./storage");
    await storage().delete(result.file.objectId);
    await db.update(attachments).set({ storageObjectId: null }).where(eq(attachments.id, result.file.id));
    return { version: result.version, cleanupPending: false };
  } catch (error) {
    console.error("Attachment cleanup failed", { attachmentId, error });
    await db.update(attachments).set({ status: "DELETE_FAILED" }).where(eq(attachments.id, result.file.id));
    return { version: result.version, cleanupPending: true };
  }
}

export async function ownedClips(userId: string, query = "", sort: "newest" | "oldest" = "newest", page = 1) {
  const pageSize = 20;
  const live = and(eq(clips.ownerUserId, userId), inArray(clips.status, ["ACTIVE", "UPLOADING"]));
  const where = query ? and(live, ilike(clips.slug, `%${query}%`)) : live;
  const items = await db.select({
    id: clips.id, slug: clips.slug, expiryMode: clips.expiryMode, expiresAt: clips.expiresAt,
    consumedAt: clips.oneTimeConsumedAt, status: clips.status, createdAt: clips.createdAt, updatedAt: clips.updatedAt,
  }).from(clips).where(where).orderBy(sort === "oldest" ? asc(clips.createdAt) : desc(clips.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const countRows = await db.select({ count: sql<number>`count(*)::int` }).from(clips).where(where);
  const bytesRows = await db.select({ bytes: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::bigint` })
    .from(attachments).innerJoin(clips, eq(clips.id, attachments.clipId)).where(and(
      eq(clips.ownerUserId, userId),
      inArray(clips.status, ["ACTIVE", "UPLOADING"]),
      eq(attachments.status, "READY"),
    ));
  return { items, total: Number(countRows[0]?.count ?? 0), bytes: Number(bytesRows[0]?.bytes ?? 0), page, pageSize };
}

export async function deleteOwnedClip(slug: string, identity: NonNullable<Identity>) {
  const records = await db.select().from(clips).where(and(
    eq(clips.slug, slug),
    inArray(clips.status, ["ACTIVE", "UPLOADING"]),
  )).orderBy(desc(clips.createdAt)).limit(1);
  const clip = records[0];
  if (!clip || clip.status === "DELETED") throw new ApiError(404, "This clip is no longer available.", "CLIP_UNAVAILABLE");
  if (clip.ownerUserId !== identity.userId) throw new ApiError(403, "Only the owner can delete this clip.", "DELETE_FORBIDDEN");
  const files = await db.transaction(async (tx) => {
    const marked = await tx.update(clips).set({ status: "DELETED", textContent: null, updatedAt: new Date() })
      .where(and(eq(clips.id, clip.id), eq(clips.ownerUserId, identity.userId), inArray(clips.status, ["ACTIVE", "UPLOADING"])))
      .returning({ id: clips.id });
    if (!marked.length) throw new ApiError(409, "This clip is no longer active.", "DELETE_CONFLICT");
    await tx.insert(activityLogs).values({ userId: identity.userId, clipId: clip.id, action: "DELETED", slug: clip.slug });
    return tx.select().from(attachments).where(and(eq(attachments.clipId, clip.id), inArray(attachments.status, ["READY", "PENDING", "DELETE_FAILED"])));
  });
  const { storage } = await import("./storage");
  let failed = 0;
  for (const file of files) {
    try {
      if (file.storageObjectId) await storage().delete(file.storageObjectId);
      else await storage().deleteUncommitted(file.clipId, file.id);
      await db.update(attachments).set({ status: "DELETED", storageObjectId: null }).where(eq(attachments.id, file.id));
    } catch (error) {
      failed += 1;
      console.error("Delete cleanup failed", { attachmentId: file.id, error });
      await db.update(attachments).set({ status: "DELETE_FAILED" }).where(eq(attachments.id, file.id));
    }
  }
  return { deleted: true, cleanupPending: failed > 0 };
}

export async function downloadableAttachment(slug: string, attachmentId: string, cookieBag: CookieBag) {
  const clip = await clipRecord(slug);
  const access = await authorizeView(clip, cookieBag);
  if (access !== "AUTHORIZED") throw new ApiError(401, "Unlock or reveal this clip before downloading files.", "VIEW_AUTH_REQUIRED");
  const rows = await db.select().from(attachments).where(and(
    eq(attachments.id, attachmentId), eq(attachments.clipId, clip.id), eq(attachments.status, "READY"),
  )).limit(1);
  const file = rows[0];
  if (!file?.storageObjectId) throw new ApiError(404, "File not found.", "FILE_NOT_FOUND");
  return file;
}
