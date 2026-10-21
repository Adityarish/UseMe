import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/http";
import { completeAttachment, uploadTarget } from "@/lib/clip-service";
import { storage } from "@/lib/storage";

type Context = { params: Promise<{ sessionId: string; attachmentId: string }> };
const MAX_PROXY_CHUNK_BYTES = 4 * 1024 * 1024;

function validateDriveUploadUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, "The upload session is invalid.", "INVALID_UPLOAD_SESSION");
  }
  if (
    url.origin !== "https://www.googleapis.com"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
    || url.pathname !== "/upload/drive/v3/files"
    || url.searchParams.get("uploadType") !== "resumable"
    || !url.searchParams.get("upload_id")
    || [...url.searchParams.keys()].length !== 2
    || [...url.searchParams.keys()].some((key) => !["uploadType", "upload_id"].includes(key))
  ) {
    throw new ApiError(400, "The upload session is invalid.", "INVALID_UPLOAD_SESSION");
  }
  return url;
}

async function authorizedTarget(request: Request, context: Context) {
  assertSameOrigin(request);
  const { sessionId, attachmentId } = await context.params;
  const token = request.headers.get("x-upload-token");
  if (!token) throw new ApiError(401, "Missing upload token.", "UPLOAD_TOKEN_REQUIRED");
  return { target: await uploadTarget(sessionId, attachmentId, token), attachmentId };
}

export async function POST(request: Request, context: Context) {
  try {
    const { target } = await authorizedTarget(request, context);
    const adapter = storage();
    if (!adapter.createDirectUpload) {
      return NextResponse.json({ mode: "proxy" }, { headers: { "cache-control": "private, no-store" } });
    }
    const direct = await adapter.createDirectUpload({
      clipId: target.session.clipId,
      attachmentId: target.attachment.id,
      size: target.attachment.sizeBytes,
      mimeType: target.attachment.mimeType,
    });
    return NextResponse.json({ mode: "direct", ...direct }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { target, attachmentId } = await authorizedTarget(request, context);
    const adapter = storage();
    if (!adapter.completeDirectUpload) throw new ApiError(409, "Direct upload is not available.", "DIRECT_UPLOAD_UNAVAILABLE");
    const payload = await request.json().catch(() => null) as { objectId?: unknown } | null;
    if (typeof payload?.objectId !== "string" || payload.objectId.length < 1 || payload.objectId.length > 512) {
      throw new ApiError(400, "The uploaded file ID is invalid.", "INVALID_STORAGE_OBJECT");
    }

    let object;
    try {
      object = await adapter.completeDirectUpload({
        clipId: target.session.clipId,
        attachmentId: target.attachment.id,
        size: target.attachment.sizeBytes,
        mimeType: target.attachment.mimeType,
        objectId: payload.objectId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "File verification failed.";
      console.error("Direct attachment verification failed", { attachmentId, message });
      const invalidUpload = /does not match|declared type|reservation/i.test(message);
      throw new ApiError(
        invalidUpload ? 400 : 502,
        invalidUpload ? message : "The uploaded file could not be verified.",
        invalidUpload ? "INVALID_UPLOAD" : "STORAGE_VERIFY_FAILED",
      );
    }

    try {
      await completeAttachment(target.attachment.id, object.objectId);
    } catch (error) {
      await adapter.delete(object.objectId).catch(() => undefined);
      throw error;
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { target } = await authorizedTarget(request, context);
    const uploadUrl = request.headers.get("x-drive-upload-url");
    const contentRange = request.headers.get("x-drive-content-range") ?? "";
    if (!uploadUrl) throw new ApiError(400, "Missing upload session.", "UPLOAD_SESSION_REQUIRED");
    const url = validateDriveUploadUrl(uploadUrl);
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    if (!range) throw new ApiError(400, "Invalid upload chunk range.", "INVALID_CHUNK_RANGE");
    const start = Number(range[1]);
    const end = Number(range[2]);
    const total = Number(range[3]);
    const chunkBytes = end - start + 1;
    if (
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total)
      || start < 0 || end < start || total !== target.attachment.sizeBytes || end >= total
      || chunkBytes > MAX_PROXY_CHUNK_BYTES
      || (end + 1 < total && chunkBytes % (256 * 1024) !== 0)
    ) {
      throw new ApiError(400, "Upload chunk does not match the reserved file size.", "INVALID_CHUNK_RANGE");
    }
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength !== chunkBytes) {
      throw new ApiError(400, "Upload chunk size does not match its range.", "CHUNK_SIZE_MISMATCH");
    }
    if (!request.body) throw new ApiError(400, "The upload chunk is empty.", "EMPTY_UPLOAD_CHUNK");
    const chunk = await request.arrayBuffer();
    if (chunk.byteLength !== chunkBytes || chunk.byteLength > MAX_PROXY_CHUNK_BYTES) {
      throw new ApiError(400, "Upload chunk size does not match its range.", "CHUNK_SIZE_MISMATCH");
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "PUT",
        headers: {
          "content-type": target.attachment.mimeType,
          "content-length": String(chunk.byteLength),
          "content-range": contentRange,
        },
        body: chunk,
        cache: "no-store",
        redirect: "manual",
      });
    } catch (error) {
      console.error("Google Drive chunk request failed", {
        attachmentId: target.attachment.id,
        message: error instanceof Error ? error.message : "network failure",
      });
      throw new ApiError(502, "Could not connect to Google Drive. Please retry the upload.", "DRIVE_UPLOAD_CONNECTION_FAILED");
    }

    if (response.status === 308 && end + 1 < total) {
      return NextResponse.json({ complete: false }, { headers: { "cache-control": "private, no-store" } });
    }
    if (response.ok && end + 1 === total) {
      const payload = await response.json().catch(() => null) as { id?: unknown } | null;
      if (typeof payload?.id !== "string" || payload.id.length > 512) {
        throw new ApiError(502, "Google Drive completed the upload without returning a file ID.", "DRIVE_UPLOAD_INVALID_RESPONSE");
      }
      return NextResponse.json({ complete: true, objectId: payload.id }, { headers: { "cache-control": "private, no-store" } });
    }
    const detail = await response.text().catch(() => "");
    console.error("Google Drive rejected an upload chunk", {
      attachmentId: target.attachment.id,
      status: response.status,
      detail: detail.replace(/\s+/g, " ").slice(0, 240),
    });
    throw new ApiError(502, `Google Drive rejected an upload chunk (HTTP ${response.status}).`, "DRIVE_CHUNK_REJECTED");
  } catch (error) {
    return apiError(error);
  }
}
