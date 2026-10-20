import { AuthForm } from "@/components/auth-form";
import { supabaseConfigured } from "@/lib/auth";

export default function SignUpPage() {
  return <div className="shell grid min-h-[70vh] place-items-center py-12">{supabaseConfigured() ? <AuthForm mode="sign-up" /> : <p>Supabase Auth is not configured.</p>}</div>;
}
