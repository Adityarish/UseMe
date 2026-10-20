"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({
  mode,
  next = "/dashboard",
  initialError = "",
}: {
  mode: "sign-in" | "sign-up";
  next?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isSignUp = mode === "sign-up";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const result = isSignUp
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    if (isSignUp && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function continueWithGoogle() {
    setBusy(true);
    setError("");
    const googleSignIn = new URL("/auth/google", window.location.origin);
    googleSignIn.searchParams.set("next", next);
    window.location.assign(googleSignIn);
  }

  return (
    <section className="card w-full max-w-md p-8">
      <p className="eyebrow">Supabase Auth</p>
      <h1 className="mt-2 text-3xl font-black">{isSignUp ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-sm text-ink/55">{isSignUp ? "Create links you can manage later." : "Sign in to view and manage your links."}</p>
      <button className="button-secondary mt-6 w-full" disabled={busy} onClick={continueWithGoogle} type="button">
        Continue with Google
      </button>
      <div className="my-5 flex items-center gap-3 text-xs text-ink/40"><span className="h-px flex-1 bg-current" />or use email<span className="h-px flex-1 bg-current" /></div>
      <form onSubmit={submit} className="space-y-4">
        <label><span className="label">Email</span><input className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span className="label">Password</span><input className="field" type="password" minLength={6} autoComplete={isSignUp ? "new-password" : "current-password"} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        {message && <p className="text-sm font-semibold text-emerald-700" role="status">{message}</p>}
        <button className="button-primary w-full" disabled={busy}>{busy ? "Please wait…" : isSignUp ? "Sign up" : "Sign in"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-ink/55">
        {isSignUp ? "Already have an account? " : "New to UseMe? "}
        <Link className="font-bold text-accent hover:underline" href={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Sign up"}</Link>
      </p>
    </section>
  );
}
