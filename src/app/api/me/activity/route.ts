import { NextResponse } from "next/server";
import { currentIdentity } from "@/lib/auth";
import { userActivity } from "@/lib/activity-service";
import { apiError } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const identity = await currentIdentity();
    if (!identity) {
      return NextResponse.json(
        { error: { code: "AUTH_REQUIRED", message: "Sign in to view your activity." } },
        { status: 401 },
      );
    }
    return NextResponse.json(await userActivity(identity.userId, new URL(request.url).searchParams.get("cursor")));
  } catch (error) {
    return apiError(error);
  }
}
