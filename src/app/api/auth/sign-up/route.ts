import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { apiError, assertSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(6).max(128),
  next: z.string().optional().default("/dashboard"),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = signUpSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    const emailKey = createHash("sha256").update(email).digest("hex");
    await rateLimit(
      `auth-signup-email:${emailKey}`,
      2,
      5 * 60,
      "Too many confirmation emails requested for this address. Please wait 5 minutes before trying again.",
    );

    const requestedNext = input.next;
    const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";
    const origin = new URL(env().NEXT_PUBLIC_APP_URL).origin;
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("next", next);

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: { emailRedirectTo: callback.toString() },
    });

    if (error) {
      const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 400;
      return NextResponse.json(
        { error: { code: error.code ?? "SIGN_UP_FAILED", message: error.message } },
        { status },
      );
    }

    return NextResponse.json({ confirmationRequired: !data.session });
  } catch (error) {
    return apiError(error);
  }
}
