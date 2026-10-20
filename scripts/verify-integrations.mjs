import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const KEEP_DEMO = process.argv.includes("--keep-demo");
const STORAGE_FOLDERS = ["Storage1", "Storage2", "Storage3"];

function loadLocalEnvironment() {
  for (const path of [".env", ".env.local"]) {
    if (!existsSync(path)) continue;
    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      if (process.env[key] !== undefined) continue;
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function requireEnvironment(names) {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

async function responseError(response, service) {
  const payload = await response.json().catch(() => ({}));
  const reason = payload.error?.message || payload.error_description || payload.msg || response.statusText;
  return new Error(`${service} failed (HTTP ${response.status}${reason ? `: ${reason}` : ""})`);
}

async function verifySupabase() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const headers = { apikey: key, authorization: `Bearer ${key}` };

  const health = await fetch(`${baseUrl}/auth/v1/health`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!health.ok) throw await responseError(health, "Supabase Auth health check");

  const settingsResponse = await fetch(`${baseUrl}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!settingsResponse.ok) throw await responseError(settingsResponse, "Supabase Auth settings check");
  const settings = await settingsResponse.json();
  const googleEnabled = settings.external?.google === true;

  console.log("PASS Supabase Auth endpoint accepts the configured project URL and publishable key.");
  console.log(`${googleEnabled ? "PASS" : "WARN"} Supabase Google provider is ${googleEnabled ? "enabled" : "not enabled"}.`);
  return googleEnabled;
}

async function googleAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw await responseError(response, "Google OAuth refresh");
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Google OAuth refresh did not return an access token.");
  return payload.access_token;
}

function driveHeaders(token, extra = {}) {
  return { authorization: `Bearer ${token}`, ...extra };
}

function escapeDriveQuery(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function googleDriveFolderId(value) {
  const input = value.trim();
  if (!input.includes("://")) return input;
  const url = new URL(input);
  const folderMatch = url.pathname.match(/\/folders\/([^/]+)/);
  const id = folderMatch?.[1] ?? url.searchParams.get("id");
  if (!id) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID must be a Drive folder ID or folder URL.");
  return decodeURIComponent(id);
}

async function ensureFolder(name, parentId, token) {
  const query = encodeURIComponent(
    `name='${escapeDriveQuery(name)}' and '${escapeDriveQuery(parentId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const found = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: driveHeaders(token), signal: AbortSignal.timeout(15_000) },
  );
  if (!found.ok) throw await responseError(found, `Google Drive lookup for ${name}`);
  const existing = (await found.json()).files?.[0];
  if (existing) return existing.id;

  const created = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: driveHeaders(token, { "content-type": "application/json" }),
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!created.ok) throw await responseError(created, `Google Drive creation for ${name}`);
  return (await created.json()).id;
}

async function deleteDriveObject(id, token) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: driveHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && response.status !== 404) throw await responseError(response, "Google Drive cleanup");
}

async function verifyDrive() {
  const token = await googleAccessToken();
  console.log("PASS Google refresh token produced a short-lived access token.");

  const rootId = googleDriveFolderId(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
  const rootResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(rootId)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`,
    { headers: driveHeaders(token), signal: AbortSignal.timeout(15_000) },
  );
  if (!rootResponse.ok) throw await responseError(rootResponse, "Google Drive root folder access");
  const root = await rootResponse.json();
  if (root.trashed || root.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID does not point to an active Drive folder.");
  }
  console.log("PASS Google Drive root folder is accessible.");

  const folderIds = {};
  for (const name of STORAGE_FOLDERS) folderIds[name] = await ensureFolder(name, rootId, token);
  console.log("PASS Storage1, Storage2, and Storage3 are accessible (missing folders were created).");

  const marker = randomUUID();
  const clipFolderName = `.useme-verification-${marker}`;
  const bytes = new TextEncoder().encode(`UseMe integration check ${marker}\n`);
  let clipFolderId;
  let fileId;
  try {
    clipFolderId = await ensureFolder(clipFolderName, folderIds.Storage1, token);
    const initiated = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id",
      {
        method: "POST",
        headers: driveHeaders(token, {
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": "text/plain",
          "x-upload-content-length": String(bytes.byteLength),
        }),
        body: JSON.stringify({
          name: "demo.txt",
          parents: [clipFolderId],
          appProperties: { clipId: clipFolderName, attachmentId: "demo.txt", verification: "true" },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!initiated.ok) throw await responseError(initiated, "Google Drive resumable upload start");
    const location = initiated.headers.get("location");
    if (!location) throw new Error("Google Drive did not return a resumable upload URL.");

    const uploaded = await fetch(location, {
      method: "PUT",
      headers: {
        "content-type": "text/plain",
        "content-length": String(bytes.byteLength),
        "content-range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
      },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });
    if (!uploaded.ok) throw await responseError(uploaded, "Google Drive demo upload");
    fileId = (await uploaded.json()).id;

    const downloaded = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: driveHeaders(token), signal: AbortSignal.timeout(15_000) },
    );
    if (!downloaded.ok) throw await responseError(downloaded, "Google Drive demo download");
    const downloadedBytes = new Uint8Array(await downloaded.arrayBuffer());
    if (downloadedBytes.length !== bytes.length || downloadedBytes.some((value, index) => value !== bytes[index])) {
      throw new Error("Google Drive demo download did not match the uploaded bytes.");
    }
    console.log("PASS A demo file was uploaded with the app's resumable protocol and downloaded byte-for-byte.");
    if (KEEP_DEMO) console.log(`INFO Demo file retained under Storage1/${clipFolderName}/demo.txt.`);
  } finally {
    if (!KEEP_DEMO) {
      if (fileId) await deleteDriveObject(fileId, token);
      if (clipFolderId) await deleteDriveObject(clipFolderId, token);
      if (fileId || clipFolderId) console.log("PASS Temporary demo objects were removed; Storage1/2/3 were preserved.");
    }
  }
}

async function main() {
  loadLocalEnvironment();
  requireEnvironment([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "GOOGLE_DRIVE_ROOT_FOLDER_ID",
  ]);

  console.log("Checking Supabase Auth and Google Drive without printing credentials...");
  let googleEnabled;
  try {
    googleEnabled = await verifySupabase();
  } catch (error) {
    const detail = error?.cause?.code || (error instanceof Error ? error.message : String(error));
    throw new Error(`Supabase Auth check could not connect: ${detail}`);
  }
  try {
    await verifyDrive();
  } catch (error) {
    const detail = error?.cause?.code || (error instanceof Error ? error.message : String(error));
    throw new Error(`Google Drive check could not connect: ${detail}`);
  }
  if (!googleEnabled) process.exitCode = 2;
}

main().catch((error) => {
  const networkCode = error?.cause?.code;
  console.error(`FAIL ${networkCode ? `${networkCode}: ` : ""}${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
