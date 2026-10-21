import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { currentIdentityFresh } from "@/lib/auth";
import { adminDeleteClip, notifyClipForDeletion } from "@/lib/moderation-service";
import { apiError } from "@/lib/http";

type Context = { params: Promise<{ clipId: string }> };
const inputSchema = z.object({ action: z.enum(["notify", "delete"]) });
const clipIdSchema = z.string().uuid();

export async function PATCH(request: Request, context: Context) {
  try {
    const admin = requireAdmin(await currentIdentityFresh());
    const clipId = clipIdSchema.parse((await context.params).clipId);
    const { action } = inputSchema.parse(await request.json());
    if (action === "notify") return NextResponse.json(await notifyClipForDeletion(clipId));
    return NextResponse.json(await adminDeleteClip(clipId, admin.userId));
  } catch (error) {
    return apiError(error);
  }
}
