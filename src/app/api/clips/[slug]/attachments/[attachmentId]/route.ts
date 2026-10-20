import { cookies } from "next/headers";
import { apiError, clientFingerprint } from "@/lib/http";
import { downloadableAttachment } from "@/lib/clip-service";
import { storage } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ slug: string; attachmentId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { slug, attachmentId } = await context.params;
    await rateLimit(`download:${slug}:${clientFingerprint(request)}`, 120, 60 * 60);
    const file = await downloadableAttachment(slug, attachmentId, await cookies());
    const object = await storage().get(file.storageObjectId!);
    const fallback = file.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const encoded = encodeURIComponent(file.originalFilename);
    const previewRequested = new URL(request.url).searchParams.get("preview") === "1";
    const previewableTypes = new Set([
      "application/pdf",
      "image/avif",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/plain",
    ]);
    const contentType = previewRequested && previewableTypes.has(file.mimeType)
      ? file.mimeType
      : "application/octet-stream";
    const disposition = contentType === "application/octet-stream" ? "attachment" : "inline";
    return new Response(object.body, {
      headers: {
        "content-type": contentType,
        "content-disposition": `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
        "content-length": String(object.size ?? file.sizeBytes),
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
