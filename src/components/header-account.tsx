"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignOutButton } from "./sign-out-button";

type AccountState = { signedIn: boolean; isAdmin: boolean; alertCount: number };

export function HeaderAccount({ authEnabled }: { authEnabled: boolean }) {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!authEnabled) return;
    const supabase = createClient();
    let active = true;

    async function loadAccount() {
      const { data, error } = await supabase.auth.getClaims();
      if (!active) return;
      const signedIn = !error && typeof data?.claims.sub === "string";
      if (!signedIn) {
        setAccount(null);
        setChecked(true);
        return;
      }

      setAccount({ signedIn: true, isAdmin: false, alertCount: 0 });
      setChecked(true);
      try {
        const response = await fetch("/api/admin/reports/count", { cache: "no-store" });
        if (!active || !response.ok) return;
        const result = await response.json() as { count?: number };
        setAccount({ signedIn: true, isAdmin: true, alertCount: result.count ?? 0 });
      } catch {
        // Admin alerts are supplementary; keep the signed-in navigation usable.
      }
    }

    void loadAccount();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setAccount(null);
        setChecked(true);
      } else {
        // Avoid awaiting Supabase calls from inside its auth-state callback.
        window.setTimeout(() => void loadAccount(), 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [authEnabled]);

  if (!authEnabled) {
    return <span className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold dark:bg-white/10">Guest mode</span>;
  }

  if (!checked || !account?.signedIn) return <Link href="/sign-in" className="button-secondary">Sign in</Link>;

  return <>
    {account.isAdmin && <Link href="/admin/reports" className="button-secondary relative px-3" aria-label={`${account.alertCount} open reports`}><Bell className="size-4" /><span className="hidden sm:inline">Alerts</span>{account.alertCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{account.alertCount > 99 ? "99+" : account.alertCount}</span>}</Link>}
    {account.isAdmin && <Link href="/admin/cleanup" className="button-secondary px-3">Route cleanup</Link>}
    <Link href="/dashboard" className="button-secondary">Dashboard</Link>
    <SignOutButton />
  </>;
}
