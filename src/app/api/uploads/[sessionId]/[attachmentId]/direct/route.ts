import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/http";
import { completeAttachment, uploadTarget } from "@/lib/clip-service";
import { storage } from "@/lib/storage";

type Context = { params: Promise<{ sessionId: string; attachmentId: string }> };

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
