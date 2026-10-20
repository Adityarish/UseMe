import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentIdentity } from "@/lib/auth";
import { removeAttachment } from "@/lib/clip-service";
import { apiError, assertSameOrigin, clientFingerprint } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ slug: string; attachmentId: string }> };

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { slug, attachmentId } = await context.params;
    await rateLimit(`edit-file:${slug}:${clientFingerprint(request)}`, 30, 60 * 60);
    const { version } = z.object({ version: z.number().int().positive() }).parse(await request.json());
    return NextResponse.json(await removeAttachment(slug, attachmentId, version, await currentIdentity(), await cookies()));
  } catch (error) {
    return apiError(error);
  }
}
