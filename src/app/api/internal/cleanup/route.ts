import { NextResponse } from "next/server";
import { cleanupExpired } from "@/lib/cleanup";
import { env } from "@/lib/env";
import { apiError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    if (request.headers.get("authorization") !== `Bearer ${env().CLEANUP_SECRET}`) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
    }
    return NextResponse.json(await cleanupExpired());
  } catch (error) {
    return apiError(error);
  }
}
