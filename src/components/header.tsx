import Link from "next/link";
import { HeaderAccount } from "./header-account";
import { ThemeToggle } from "./theme-toggle";
import { supabaseConfigured } from "@/lib/auth";

export function Header() {
  const authEnabled = supabaseConfigured();
  return (
    <header className="shell flex h-20 items-center justify-between">
      <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
        <span className="grid size-9 place-items-center rounded-xl bg-ink text-paper">U</span>
        UseMe
      </Link>
      <nav className="flex items-center gap-2" aria-label="Main navigation">
        <ThemeToggle />
        <HeaderAccount authEnabled={authEnabled} />
      </nav>
    </header>
  );
}
