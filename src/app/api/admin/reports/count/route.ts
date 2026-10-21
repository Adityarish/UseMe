import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { currentIdentityFresh } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { openReportCount } from "@/lib/moderation-service";

export async function GET() {
  try {
    requireAdmin(await currentIdentityFresh());
    return NextResponse.json({ count: await openReportCount() }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return apiError(error);
  }
}
