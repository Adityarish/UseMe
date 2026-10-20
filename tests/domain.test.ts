import { describe, expect, it } from "vitest";
import { expiryFor, isUnavailable, normalizeSlug, safeFilename, validateSlug } from "@/lib/domain";
import { googleDriveFolderId, STORAGE_FOLDERS, storageFolderFor } from "@/lib/storage/shard";

describe("slug rules", () => {
  it("normalizes spaces and case", () => expect(normalizeSlug("  Project Notes  ")).toBe("project-notes"));
  it("rejects reserved and unsafe values", () => {
    expect(() => validateSlug("dashboard")).toThrow(/reserved/i);
    expect(() => validateSlug("../secret")).toThrow();
    expect(() => validateSlug("ab")).toThrow();
  });
  it("accepts memorable slugs", () => expect(validateSlug("interview-2026")).toBe("interview-2026"));
});

describe("expiration", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  it("stores forever as null", () => expect(expiryFor("FOREVER", now)).toBeNull());
  it("computes UTC durations", () => {
    expect(expiryFor("HOUR", now)?.toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(expiryFor("MONTH", now)?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
  it("denies inactive and expired records immediately", () => {
    expect(isUnavailable({ status: "DELETED", expiresAt: null }, now)).toBe(true);
    expect(isUnavailable({ status: "ACTIVE", expiresAt: new Date("2025-12-31") }, now)).toBe(true);
    expect(isUnavailable({ status: "ACTIVE", expiresAt: null }, now)).toBe(false);
    expect(isUnavailable({ status: "UPLOADING", expiresAt: null, textContent: "saved text" }, now)).toBe(false);
    expect(isUnavailable({ status: "UPLOADING", expiresAt: null, textContent: null }, now)).toBe(true);
  });
});

it("removes paths and control characters from display filenames", () => {
  expect(safeFilename("../../folder\\evil\u0000.txt")).toBe("evil.txt");
});

describe("storage sharding", () => {
  it("deterministically assigns clips to one of the three storage folders", () => {
    const clipId = "16a774ab-e415-42f6-a49d-208a328e0879";
    expect(STORAGE_FOLDERS).toEqual(["Storage1", "Storage2", "Storage3"]);
    expect(storageFolderFor(clipId)).toBe(storageFolderFor(clipId));
    expect(STORAGE_FOLDERS).toContain(storageFolderFor(clipId));
  });
  it("accepts either a Drive folder ID or copied folder URL", () => {
    const id = "1rQKL3OcyIzcqM6BDdmBd7Dfg9SG20V66";
    expect(googleDriveFolderId(id)).toBe(id);
    expect(googleDriveFolderId(`https://drive.google.com/drive/u/0/folders/${id}`)).toBe(id);
  });
});
