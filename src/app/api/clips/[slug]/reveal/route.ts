import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiError, assertSameOrigin, clientFingerprint } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { revealOneTime } from "@/lib/clip-service";
import { oneTimeCookieName } from "@/lib/security";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { slug } = await context.params;
    await rateLimit(`reveal:${slug}:${clientFingerprint(request)}`, 5, 60);
    const access = await revealOneTime(slug, await cookies());
    const response = NextResponse.json({ revealed: true, expiresAt: access.expiresAt });
    response.cookies.set(oneTimeCookieName(access.clipId), access.token, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
      expires: access.expiresAt, path: "/",
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
