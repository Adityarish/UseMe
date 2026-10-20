import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const configuredOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? requestUrl.origin).origin;
  const next = safeNext(requestUrl.searchParams.get("next"));

  // PKCE cookies are host-specific. Start the flow on the configured origin so
  // localhost, 127.0.0.1, and a LAN address cannot be mixed accidentally.
  if (requestUrl.origin !== configuredOrigin) {
    const canonical = new URL("/auth/google", configuredOrigin);
    canonical.searchParams.set("next", next);
    return NextResponse.redirect(canonical);
  }

  const callback = new URL("/auth/callback", configuredOrigin);
  callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    const signIn = new URL("/sign-in", configuredOrigin);
    signIn.searchParams.set("error", error?.message ?? "Google sign-in could not be started.");
    return NextResponse.redirect(signIn);
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
