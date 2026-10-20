import type { DownloadObject, PutObjectInput, StorageAdapter, StoredObject } from "./types";
import { env } from "../env";
import { googleDriveFolderId, storageFolderFor } from "./shard";

type DriveFile = { id: string };
const DRIVE_CHUNK_BYTES = 8 * 1024 * 1024;

async function driveError(action: string, response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string } | string;
    error_description?: string;
  } | null;
  const detail = typeof payload?.error === "string"
    ? payload.error
    : payload?.error?.message ?? payload?.error_description;
  const safeDetail = detail?.replace(/\s+/g, " ").slice(0, 240);
  return new Error(`${action} failed (${response.status}${safeDetail ? `: ${safeDetail}` : ""})`);
}

async function retryableFetch(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, init);
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  return response!;
}

async function* fixedChunks(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader();
  let buffered = new Uint8Array();
  while (true) {
    const { value, done } = await reader.read();
    if (value?.length) {
      const combined = new Uint8Array(buffered.length + value.length);
      combined.set(buffered); combined.set(value, buffered.length); buffered = combined;
      while (buffered.length >= maxBytes) {
        yield buffered.slice(0, maxBytes);
        buffered = buffered.slice(maxBytes);
      }
    }
    if (done) {
      if (buffered.length) yield buffered;
      return;
    }
  }
}

export class GoogleDriveStorageAdapter implements StorageAdapter {
  readonly provider = "google-drive" as const;

  private async accessToken(): Promise<string> {
    const config = env();
    const response = await retryableFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID!,
        client_secret: config.GOOGLE_CLIENT_SECRET!,
        refresh_token: config.GOOGLE_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
    if (!response.ok) throw await driveError("Google OAuth refresh", response);
    const data = await response.json() as { access_token?: string };
    if (!data.access_token) throw new Error("Google OAuth response did not include an access token");
    return data.access_token;
  }

  private async ensureFolder(name: string, parentId: string, token: string): Promise<string> {
    const escaped = name.replaceAll("'", "\\'");
    const query = encodeURIComponent(`name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const found = await retryableFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!found.ok) throw await driveError("Google Drive folder lookup", found);
    const list = await found.json() as { files: DriveFile[] };
    if (list.files[0]) return list.files[0].id;
    const created = await retryableFetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    });
    if (!created.ok) throw await driveError("Google Drive folder creation", created);
    return ((await created.json()) as DriveFile).id;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const config = env();
    const token = await this.accessToken();
    const rootFolderId = googleDriveFolderId(config.GOOGLE_DRIVE_ROOT_FOLDER_ID!);
    const storageFolder = await this.ensureFolder(storageFolderFor(input.clipId), rootFolderId, token);
    const clipFolder = await this.ensureFolder(input.clipId, storageFolder, token);
    const initiate = await retryableFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": input.mimeType,
        "x-upload-content-length": String(input.size),
      },
      body: JSON.stringify({ name: input.attachmentId, parents: [clipFolder], appProperties: { clipId: input.clipId, attachmentId: input.attachmentId } }),
    });
    const location = initiate.headers.get("location");
    if (!initiate.ok) throw await driveError("Google Drive resumable upload initiation", initiate);
    if (!location) throw new Error("Google Drive resumable upload initiation returned no upload URL");
    let offset = 0;
    let uploaded: Response | undefined;
    for await (const chunk of fixedChunks(input.body, DRIVE_CHUNK_BYTES)) {
      const end = offset + chunk.byteLength - 1;
      uploaded = await retryableFetch(location, {
        method: "PUT",
        headers: {
          "content-type": input.mimeType,
          "content-length": String(chunk.byteLength),
          "content-range": `bytes ${offset}-${end}/${input.size}`,
        },
        body: chunk,
      });
      const last = end + 1 === input.size;
      if ((!last && uploaded.status !== 308) || (last && !uploaded.ok)) {
        throw await driveError("Google Drive upload", uploaded);
      }
      offset = end + 1;
    }
    if (offset !== input.size || !uploaded?.ok) throw new Error("Google Drive upload ended before all bytes were accepted");
    return { objectId: ((await uploaded.json()) as DriveFile).id };
  }

  async get(objectId: string): Promise<DownloadObject> {
    const token = await this.accessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(objectId)}?alt=media&supportsAllDrives=true`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok) throw await driveError("Google Drive download", response);
    if (!response.body) throw new Error("Google Drive download returned an empty response body");
    return { body: response.body, size: Number(response.headers.get("content-length")) || undefined };
  }

  async delete(objectId: string): Promise<void> {
    const token = await this.accessToken();
    const response = await retryableFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(objectId)}?supportsAllDrives=true`, {
      method: "DELETE", headers: { authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok && response.status !== 404) throw await driveError("Google Drive deletion", response);
  }

  async deleteUncommitted(clipId: string, attachmentId: string): Promise<void> {
    const token = await this.accessToken();
    const q = encodeURIComponent(`appProperties has { key='clipId' and value='${clipId}' } and appProperties has { key='attachmentId' and value='${attachmentId}' } and trashed=false`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok) throw await driveError("Google Drive orphan lookup", response);
    const data = await response.json() as { files: DriveFile[] };
    await Promise.all(data.files.map((file) => this.delete(file.id)));
  }
}
