export const RESERVED_SLUGS = new Set([
  "api", "dashboard", "sign-in", "sign-up", "settings", "admin", "create", "edit",
  "manifest.webmanifest", "offline", "robots.txt", "sitemap.xml", "favicon.ico",
]);

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;
export type ExpiryMode = "ONCE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "FOREVER";

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

export function validateSlug(input: string): string {
  const slug = normalizeSlug(input);
  if (slug.length < 1 || slug.length > 48 || !SLUG_PATTERN.test(slug)) {
    throw new Error("Use 1–48 lowercase letters, numbers, or single hyphens.");
  }
  if (RESERVED_SLUGS.has(slug)) throw new Error("That name is reserved.");
  return slug;
}

export function expiryFor(mode: ExpiryMode, now = new Date()): Date | null {
  const durations: Partial<Record<ExpiryMode, number>> = {
    ONCE: 24 * 60 * 60_000,
    HOUR: 60 * 60_000,
    DAY: 24 * 60 * 60_000,
    WEEK: 7 * 24 * 60 * 60_000,
    MONTH: 30 * 24 * 60 * 60_000,
  };
  return mode === "FOREVER" ? null : new Date(now.getTime() + durations[mode]!);
}

export function safeFilename(input: string): string {
  const leaf = input.replaceAll("\\", "/").split("/").pop() ?? "file";
  const cleaned = leaf.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, 180) || "file";
}

export function isUnavailable(
  clip: { status: string; expiresAt: Date | null; textContent?: string | null },
  now = new Date(),
): boolean {
  // Older text-and-file clips may still be UPLOADING after a Drive failure.
  // Their saved text remains readable while pending files stay hidden.
  const readable = clip.status === "ACTIVE"
    || (clip.status === "UPLOADING" && Boolean(clip.textContent?.trim()));
  return !readable || (clip.expiresAt !== null && clip.expiresAt <= now);
}
