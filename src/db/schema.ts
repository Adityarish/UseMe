import {
  bigint,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const accessPolicy = pgEnum("access_policy", ["PUBLIC", "PASSWORD"]);
export const editPolicy = pgEnum("edit_policy", ["NONE", "PUBLIC", "PASSWORD"]);
export const expiryMode = pgEnum("expiry_mode", ["ONCE", "HOUR", "DAY", "WEEK", "MONTH", "FOREVER"]);
export const clipStatus = pgEnum("clip_status", ["UPLOADING", "ACTIVE", "DELETED"]);
export const attachmentStatus = pgEnum("attachment_status", ["PENDING", "READY", "QUARANTINED", "DELETED", "DELETE_FAILED"]);
export const uploadStatus = pgEnum("upload_status", ["OPEN", "COMPLETE", "EXPIRED", "FAILED"]);
export const uploadPurpose = pgEnum("upload_purpose", ["CREATE", "EDIT"]);
export const activityAction = pgEnum("activity_action", ["CREATED", "UPDATED", "DELETED", "FILES_ADDED", "FILE_REMOVED"]);
export const reportStatus = pgEnum("report_status", ["OPEN", "REVIEWED", "DISMISSED", "ACTIONED"]);

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clips = pgTable(
  "clips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    ownerUserId: text("owner_user_id").references(() => profiles.userId, { onDelete: "set null" }),
    textContent: text("text_content"),
    language: text("language").default("plain").notNull(),
    viewPolicy: accessPolicy("view_policy").default("PUBLIC").notNull(),
    viewPasswordHash: text("view_password_hash"),
    editPolicy: editPolicy("edit_policy").default("NONE").notNull(),
    editPasswordHash: text("edit_password_hash"),
    expiryMode: expiryMode("expiry_mode").default("DAY").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    oneTimeConsumedAt: timestamp("one_time_consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletionNoticeAt: timestamp("deletion_notice_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    status: clipStatus("status").default("UPLOADING").notNull(),
  },
  (table) => [
    uniqueIndex("clips_slug_live_unique").on(table.slug)
      .where(sql`${table.status} IN ('UPLOADING', 'ACTIVE')`),
    index("clips_owner_created_idx").on(table.ownerUserId, table.createdAt),
    index("clips_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clipId: uuid("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    storageProvider: text("storage_provider").notNull(),
    storageObjectId: text("storage_object_id"),
    status: attachmentStatus("status").default("PENDING").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("attachments_clip_idx").on(table.clipId)],
);

export const oneTimeSessions = pgTable(
  "one_time_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clipId: uuid("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("one_time_sessions_token_unique").on(table.tokenHash),
    index("one_time_sessions_clip_idx").on(table.clipId),
  ],
);

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clipId: uuid("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull(),
    purpose: uploadPurpose("purpose").default("CREATE").notNull(),
    baseVersion: integer("base_version"),
    status: uploadStatus("status").default("OPEN").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("upload_sessions_token_unique").on(table.tokenHash),
    index("upload_sessions_expiry_idx").on(table.status, table.expiresAt),
  ],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    hits: integer("hits").default(1).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.bucket] }), index("rate_limits_expiry_idx").on(table.expiresAt)],
);

export const abuseReports = pgTable(
  "abuse_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clipId: uuid("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    reporterFingerprint: text("reporter_fingerprint").notNull(),
    status: reportStatus("status").default("OPEN").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: text("reviewed_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("abuse_reports_clip_idx").on(table.clipId, table.createdAt),
    index("abuse_reports_status_created_idx").on(table.status, table.createdAt, table.id),
  ],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id").notNull().references(() => profiles.userId, { onDelete: "cascade" }),
    clipId: uuid("clip_id").references(() => clips.id, { onDelete: "set null" }),
    action: activityAction("action").notNull(),
    slug: text("slug").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("activity_logs_user_created_idx").on(table.userId, table.createdAt, table.id)],
);
