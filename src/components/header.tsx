import Link from "next/link";
import { currentIdentity, supabaseConfigured } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

export async function Header() {
  const authEnabled = supabaseConfigured();
  const identity = authEnabled ? await currentIdentity() : null;
  return (
    <header className="shell flex h-20 items-center justify-between">
      <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
        <span className="grid size-9 place-items-center rounded-xl bg-ink text-paper">U</span>
        UseMe
      </Link>
      <nav className="flex items-center gap-2" aria-label="Main navigation">
        <ThemeToggle />
        {authEnabled ? (
          identity ? <>
              <Link href="/dashboard" className="button-secondary">Dashboard</Link>
              <SignOutButton />
            </> : <Link href="/sign-in" className="button-secondary">Sign in</Link>
        ) : <span className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold dark:bg-white/10">Guest mode</span>}
      </nav>
    </header>
  );
}
