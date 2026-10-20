import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/http";
import { finalizeUpload } from "@/lib/clip-service";

type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { sessionId } = await context.params;
    const token = request.headers.get("x-upload-token");
    if (!token) return NextResponse.json({ error: { code: "UPLOAD_TOKEN_REQUIRED", message: "Missing upload token." } }, { status: 401 });
    return NextResponse.json(await finalizeUpload(sessionId, token));
  } catch (error) {
    return apiError(error);
  }
}
