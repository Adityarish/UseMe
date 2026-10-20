import { AuthForm } from "@/components/auth-form";
import { supabaseConfigured } from "@/lib/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; error?: string }>;
}) {
  const params = await searchParams;
  const requested = params.redirect_url;
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
  return <div className="shell grid min-h-[70vh] place-items-center py-12">{supabaseConfigured() ? <AuthForm mode="sign-in" next={next} initialError={params.error ?? ""} /> : <p>Supabase Auth is not configured.</p>}</div>;
}
