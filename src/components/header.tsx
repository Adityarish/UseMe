import Link from "next/link";
import { Bell } from "lucide-react";
import { isAdmin } from "@/lib/admin";
import { currentIdentity, supabaseConfigured } from "@/lib/auth";
import { openReportCount } from "@/lib/moderation-service";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

export async function Header() {
  const authEnabled = supabaseConfigured();
  const identity = authEnabled ? await currentIdentity() : null;
  const admin = isAdmin(identity);
  const alertCount = admin ? await openReportCount() : 0;
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
              {admin && <Link href="/admin/reports" className="button-secondary relative px-3" aria-label={`${alertCount} open reports`}><Bell className="size-4" /><span className="hidden sm:inline">Alerts</span>{alertCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{alertCount > 99 ? "99+" : alertCount}</span>}</Link>}
              <Link href="/dashboard" className="button-secondary">Dashboard</Link>
              <SignOutButton />
            </> : <Link href="/sign-in" className="button-secondary">Sign in</Link>
        ) : <span className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold dark:bg-white/10">Guest mode</span>}
      </nav>
    </header>
  );
}
