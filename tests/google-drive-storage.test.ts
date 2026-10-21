import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Google Drive storage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    Object.assign(process.env, {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      APP_SECRET: "a".repeat(32),
      CLEANUP_SECRET: "b".repeat(24),
      STORAGE_PROVIDER: "google-drive",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      GOOGLE_REFRESH_TOKEN: "test-refresh",
      GOOGLE_DRIVE_ROOT_FOLDER_ID: "root-folder",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uploads through a Storage1/2/3 shard and a clip folder", async () => {
    const responses = [
      new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 }),
      new Response(JSON.stringify({ files: [] }), { status: 200 }),
      new Response(JSON.stringify({ id: "storage-folder" }), { status: 200 }),
      new Response(JSON.stringify({ files: [] }), { status: 200 }),
      new Response(JSON.stringify({ id: "clip-folder" }), { status: 200 }),
      new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/session" } }),
      new Response(JSON.stringify({ id: "drive-object" }), { status: 200 }),
    ];
    const fetchMock = vi.fn<typeof fetch>(async () => responses.shift() ?? new Response(null, { status: 500 }));
    global.fetch = fetchMock as typeof fetch;

    const { GoogleDriveStorageAdapter } = await import("@/lib/storage/google-drive");
    const bytes = new TextEncoder().encode("demo");
    const result = await new GoogleDriveStorageAdapter().put({
      clipId: "demo-clip",
      attachmentId: "demo-attachment",
      size: bytes.byteLength,
      mimeType: "text/plain",
      body: new Blob([bytes]).stream(),
    });

    expect(result).toEqual({ objectId: "drive-object" });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const calls = fetchMock.mock.calls as [URL | RequestInfo, RequestInit?][];
    expect(String(calls[1][0])).toContain("drive/v3/files?q=");
    const storageFolderBody = JSON.parse(String(calls[2][1]?.body));
    expect(["Storage1", "Storage2", "Storage3"]).toContain(storageFolderBody.name);
    expect(storageFolderBody.parents).toEqual(["root-folder"]);
    expect(JSON.parse(String(calls[4][1]?.body))).toMatchObject({ name: "demo-clip", parents: ["storage-folder"] });
    expect(String(calls[5][0])).toContain("uploadType=resumable");
    expect(calls[6][0]).toBe("https://www.googleapis.com/upload/session");
  });

  it("creates a browser upload session and verifies the completed Drive object", async () => {
    const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
    const responses = [
      new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 }),
      new Response(JSON.stringify({ files: [{ id: "storage-folder" }] }), { status: 200 }),
      new Response(JSON.stringify({ files: [{ id: "clip-folder" }] }), { status: 200 }),
      new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/session" } }),
      new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 }),
      new Response(JSON.stringify({
        id: "drive-object",
        name: "demo-attachment",
        size: String(pdf.byteLength),
        mimeType: "application/pdf",
        trashed: false,
        appProperties: { clipId: "demo-clip", attachmentId: "demo-attachment" },
      }), { status: 200 }),
      new Response(pdf, { status: 206 }),
    ];
    const fetchMock = vi.fn<typeof fetch>(async () => responses.shift() ?? new Response(null, { status: 500 }));
    global.fetch = fetchMock as typeof fetch;

    const { GoogleDriveStorageAdapter } = await import("@/lib/storage/google-drive");
    const adapter = new GoogleDriveStorageAdapter();
    const input = {
      clipId: "demo-clip",
      attachmentId: "demo-attachment",
      size: pdf.byteLength,
      mimeType: "application/pdf",
    };
    const prepared = await adapter.createDirectUpload(input);
    const completed = await adapter.completeDirectUpload({ ...input, objectId: "drive-object" });

    expect(prepared).toEqual({ uploadUrl: "https://www.googleapis.com/upload/session", chunkSize: 8 * 1024 * 1024 });
    expect(completed).toEqual({ objectId: "drive-object" });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const calls = fetchMock.mock.calls as [URL | RequestInfo, RequestInit?][];
    expect(calls[5][0]).toContain("fields=id,name,size,mimeType,trashed,appProperties");
    expect(calls[6][1]?.headers).toMatchObject({ range: "bytes=0-15" });
  });
});
