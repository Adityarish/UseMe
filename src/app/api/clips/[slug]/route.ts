import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentIdentity } from "@/lib/auth";
import { apiError, assertSameOrigin, clientFingerprint } from "@/lib/http";
import { deleteOwnedClip, editClip, publicClip } from "@/lib/clip-service";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { slug } = await context.params;
    return NextResponse.json(await publicClip(slug, await cookies(), await currentIdentity()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { slug } = await context.params;
    await rateLimit(`edit:${slug}:${clientFingerprint(request)}`, 30, 60 * 60);
    return NextResponse.json(await editClip(slug, await request.json(), await currentIdentity(), await cookies()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const identity = await currentIdentity();
    if (!identity) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "Sign in to delete a clip." } }, { status: 401 });
    const { slug } = await context.params;
    await rateLimit(`delete:${identity.userId}`, 30, 60 * 60);
    return NextResponse.json(await deleteOwnedClip(slug, identity));
  } catch (error) {
    return apiError(error);
  }
}
