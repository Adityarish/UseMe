import { NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin } from "@/lib/http";
import { completeAttachment, uploadTarget } from "@/lib/clip-service";
import { storage } from "@/lib/storage";
import { validatedUploadStream } from "@/lib/upload-stream";

type Context = { params: Promise<{ sessionId: string; attachmentId: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { sessionId, attachmentId } = await context.params;
    const token = request.headers.get("x-upload-token");
    if (!token) return NextResponse.json({ error: { code: "UPLOAD_TOKEN_REQUIRED", message: "Missing upload token." } }, { status: 401 });
    const target = await uploadTarget(sessionId, attachmentId, token);
    if (!request.body) return NextResponse.json({ error: { code: "EMPTY_UPLOAD", message: "The upload body is empty." } }, { status: 400 });
    const contentLength = Number(request.headers.get("content-length"));
    if (!Number.isFinite(contentLength) || contentLength !== target.attachment.sizeBytes) {
      return NextResponse.json({ error: { code: "SIZE_MISMATCH", message: "Upload size does not match the reservation." } }, { status: 400 });
    }
    let object;
    try {
      object = await storage().put({
        clipId: target.session.clipId,
        attachmentId: target.attachment.id,
        size: target.attachment.sizeBytes,
        mimeType: target.attachment.mimeType,
        body: validatedUploadStream(request.body, target.attachment.sizeBytes, target.attachment.mimeType),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "File storage failed.";
      console.error("Attachment upload failed", { attachmentId, message });
      const invalidUpload = /declared type|size mismatch|exceeded its declared size/i.test(message);
      throw new ApiError(
        invalidUpload ? 400 : 502,
        invalidUpload ? message : `File storage failed: ${message}`,
        invalidUpload ? "INVALID_UPLOAD" : "STORAGE_UPLOAD_FAILED",
      );
    }
    try {
      await completeAttachment(target.attachment.id, object.objectId);
    } catch (error) {
      await storage().delete(object.objectId).catch(() => undefined);
      throw error;
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
