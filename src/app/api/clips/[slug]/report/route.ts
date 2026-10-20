import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { abuseReports } from "@/db/schema";
import { clipRecord } from "@/lib/clip-service";
import { apiError, assertSameOrigin, clientFingerprint } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ slug: string }> };
const reportSchema = z.object({ reason: z.string().trim().min(10).max(500) });

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const fingerprint = clientFingerprint(request);
    await rateLimit(`report:${fingerprint}`, 5, 24 * 60 * 60);
    const { slug } = await context.params;
    const clip = await clipRecord(slug);
    const { reason } = reportSchema.parse(await request.json());
    await db.insert(abuseReports).values({ clipId: clip.id, reason, reporterFingerprint: fingerprint });
    return NextResponse.json({ reported: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
