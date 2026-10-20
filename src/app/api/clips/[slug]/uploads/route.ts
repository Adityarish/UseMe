import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentIdentity } from "@/lib/auth";
import { startEditUpload } from "@/lib/clip-service";
import { apiError, assertSameOrigin, clientFingerprint } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { slug } = await context.params;
    await rateLimit(`edit-upload:${slug}:${clientFingerprint(request)}`, 10, 60 * 60);
    return NextResponse.json(await startEditUpload(slug, await request.json(), await currentIdentity(), await cookies()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
