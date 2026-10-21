import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const requested = url.searchParams.get("next") ?? "/dashboard";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
  const origin = process.env.NODE_ENV === "development"
    ? url.origin
    : new URL(process.env.NEXT_PUBLIC_APP_URL ?? url.origin).origin;
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (!error) return NextResponse.redirect(new URL(next, origin));

    // OAuth authorization codes are single-use. Some browsers, extensions, or
    // development tooling can replay this callback after the first request has
    // already exchanged the code. If that first exchange established a valid
    // session, treat the replay as success instead of showing a false error.
    const isReplayedCode = error.code === "flow_state_not_found"
      || error.message === "invalid flow state, no valid flow state found";
    if (isReplayedCode) {
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
      if (!claimsError && claimsData?.claims.sub) {
        return NextResponse.redirect(new URL(next, origin));
      }
    }

    console.error("Supabase OAuth code exchange failed:", error.message);
    const signInUrl = new URL("/sign-in", origin);
    signInUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(signInUrl);
  }
  const signInUrl = new URL("/sign-in", origin);
  signInUrl.searchParams.set("error", providerError ?? "Google sign-in did not return an authorization code.");
  return NextResponse.redirect(signInUrl);
}
