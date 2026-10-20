import { z } from "zod";

export const fileManifestSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  type: z.string().max(255).default("application/octet-stream"),
});

export const createClipSchema = z.object({
  slug: z.string(),
  text: z.string().max(1_000_000).default(""),
  language: z.string().regex(/^[a-z0-9+#-]{1,30}$/i).default("plain"),
  viewPolicy: z.enum(["PUBLIC", "PASSWORD"]).default("PUBLIC"),
  viewPassword: z.string().min(8).max(128).optional(),
  editPolicy: z.enum(["NONE", "PUBLIC", "PASSWORD"]).default("NONE"),
  editPassword: z.string().min(8).max(128).optional(),
  expiryMode: z.enum(["ONCE", "HOUR", "DAY", "WEEK", "MONTH", "FOREVER"]).default("DAY"),
  files: z.array(fileManifestSchema).default([]),
}).superRefine((value, context) => {
  if (!value.text.trim() && value.files.length === 0) {
    context.addIssue({ code: "custom", message: "Add text or at least one file." });
  }
  if (value.viewPolicy === "PASSWORD" && !value.viewPassword) {
    context.addIssue({ code: "custom", path: ["viewPassword"], message: "A view password is required." });
  }
  if (value.editPolicy === "PASSWORD" && !value.editPassword) {
    context.addIssue({ code: "custom", path: ["editPassword"], message: "An edit password is required." });
  }
});

export const passwordSchema = z.object({ password: z.string().min(1).max(128) });
export const editClipSchema = z.object({
  text: z.string().max(1_000_000),
  language: z.string().regex(/^[a-z0-9+#-]{1,30}$/i),
  version: z.number().int().positive(),
});

export const editUploadSchema = z.object({
  files: z.array(fileManifestSchema).min(1),
  version: z.number().int().positive(),
});
