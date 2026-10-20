import { NextResponse } from "next/server";
import { apiError, assertSameOrigin, clientFingerprint } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { passwordSchema } from "@/lib/validation";
import { unlockEdit } from "@/lib/clip-service";
import { editCookieName } from "@/lib/security";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { slug } = await context.params;
    await rateLimit(`edit-unlock:${slug}:${clientFingerprint(request)}`, 8, 15 * 60);
    const { password } = passwordSchema.parse(await request.json());
    const access = await unlockEdit(slug, password);
    const response = NextResponse.json({ unlocked: true });
    response.cookies.set(editCookieName(access.clipId), access.token, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
      expires: access.expiresAt, path: "/",
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
