import { NextResponse } from "next/server";
import { createClip } from "@/lib/clip-service";
import { currentIdentity } from "@/lib/auth";
import { apiError, assertSameOrigin, clientFingerprint } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(`create:${clientFingerprint(request)}`, 10, 60 * 60);
    const result = await createClip(await request.json(), await currentIdentity());
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
