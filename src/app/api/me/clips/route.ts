import { NextResponse } from "next/server";
import { currentIdentity } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { ownedClips } from "@/lib/clip-service";

export async function GET(request: Request) {
  try {
    const identity = await currentIdentity();
    if (!identity) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "Sign in to view your clips." } }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const sort = params.get("sort") === "oldest" ? "oldest" : "newest";
    return NextResponse.json(await ownedClips(identity.userId, params.get("q")?.slice(0, 100) ?? "", sort, page));
  } catch (error) {
    return apiError(error);
  }
}
