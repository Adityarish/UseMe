import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { currentIdentityFresh } from "@/lib/auth";
import { apiError, assertSameOrigin } from "@/lib/http";
import { moderateReport } from "@/lib/moderation-service";

type Context = { params: Promise<{ reportId: string }> };
const inputSchema = z.object({ action: z.enum(["review", "dismiss", "delete"]) });
const idSchema = z.string().uuid();

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const admin = requireAdmin(await currentIdentityFresh());
    const reportId = idSchema.parse((await context.params).reportId);
    const { action } = inputSchema.parse(await request.json());
    return NextResponse.json(await moderateReport(reportId, action, admin.userId));
  } catch (error) {
    return apiError(error);
  }
}
