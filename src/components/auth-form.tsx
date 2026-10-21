"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, Check, LockKeyhole, Sparkles, Zap } from "lucide-react";
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
  const oauthNavigationStarted = useRef(false);
  const isSignUp = mode === "sign-up";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    if (isSignUp) {
      try {
        const response = await fetch("/api/auth/sign-up", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, next }),
        });
        const result = await response.json() as {
          confirmationRequired?: boolean;
          error?: { message?: string };
        };
        if (!response.ok) {
          setError(result.error?.message ?? "Unable to create your account. Please try again.");
          setBusy(false);
          return;
        }
        if (result.confirmationRequired) {
          setMessage("Check your email to confirm your account, then sign in.");
          setBusy(false);
          return;
        }
      } catch {
        setError("Unable to create your account. Please try again.");
        setBusy(false);
        return;
      }
    } else {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError(result.error.message);
        setBusy(false);
        return;
      }
    }
    router.push(next);
    router.refresh();
  }

  async function continueWithGoogle() {
    // React state is not synchronous, so two rapid clicks can otherwise start
    // two PKCE flows before the button becomes disabled.
    if (oauthNavigationStarted.current) return;
    oauthNavigationStarted.current = true;
    setBusy(true);
    setError("");
    const googleSignIn = new URL("/auth/google", window.location.origin);
    googleSignIn.searchParams.set("next", next);
    window.location.assign(googleSignIn);
  }

  return (
    <section className="card grid w-full max-w-4xl overflow-hidden sm:grid-cols-[.9fr_1.1fr]">
      <aside className="relative isolate overflow-hidden bg-ink px-7 py-8 text-paper sm:p-10">
        <div className="absolute -right-16 -top-16 -z-10 size-56 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -bottom-20 -left-14 -z-10 size-60 rounded-full bg-amber-400/15 blur-3xl" />
        <Link href="/" className="hidden items-center gap-2 font-black tracking-tight sm:inline-flex">
          <span className="grid size-9 place-items-center rounded-xl bg-paper text-ink">U</span>
          UseMe
        </Link>
        <div className="mt-2 sm:mt-20">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-paper/10 ring-1 ring-paper/15">
            {isSignUp ? <Sparkles className="size-6" aria-hidden /> : <Zap className="size-6" aria-hidden />}
          </div>
          <h2 className="max-w-xs text-3xl font-black tracking-tight">
            {isSignUp ? "Share smarter from day one." : "Everything you shared, right where you left it."}
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-paper/65">
            Create memorable links, protect what matters, and manage every clip from one simple workspace.
          </p>
          <ul className="mt-7 hidden space-y-3 text-sm font-semibold text-paper/80 sm:block">
            {["Your clips in one place", "Private and password-ready", "Files and text in one link"].map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <span className="grid size-5 place-items-center rounded-full bg-paper/10"><Check className="size-3" aria-hidden /></span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="p-7 sm:p-10">
        <p className="eyebrow">{isSignUp ? "Welcome to UseMe" : "Welcome back to UseMe"}</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          {isSignUp ? "Create your account" : "Good to see you again."}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/55">
          {isSignUp ? "Start creating secure, easy-to-share links in seconds." : "Sign in to open your workspace and manage your shared clips."}
        </p>

        <button className="button-secondary mt-7 w-full" disabled={busy} onClick={continueWithGoogle} type="button">
          <span className="grid size-6 place-items-center rounded-full bg-white text-sm font-black text-blue-600 shadow-sm">G</span>
          Continue with Google
        </button>
        <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.14em] text-ink/35">
          <span className="h-px flex-1 bg-current" />or continue with email<span className="h-px flex-1 bg-current" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block" htmlFor={`${mode}-email`}>
            <span className="label">Email address</span>
            <input id={`${mode}-email`} className="field" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block" htmlFor={`${mode}-password`}>
            <span className="label">Password</span>
            <input id={`${mode}-password`} className="field" type="password" minLength={6} autoComplete={isSignUp ? "new-password" : "current-password"} placeholder={isSignUp ? "At least 6 characters" : "Enter your password"} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600" role="alert">{error}</p>}
          {message && <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400" role="status">{message}</p>}
          <button className="button-primary group w-full" disabled={busy}>
            {busy ? "Please wait…" : isSignUp ? "Create my UseMe account" : "Sign in to UseMe"}
            {!busy && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink/55">
          {isSignUp ? "Already part of UseMe? " : "New to UseMe? "}
          <Link className="font-bold text-accent hover:underline" href={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Create an account"}</Link>
        </p>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-ink/35">
          <LockKeyhole className="size-3.5" aria-hidden /> Secure authentication powered by Supabase
        </p>
      </div>
    </section>
  );
}
