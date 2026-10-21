import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AdminClipCleanup } from "@/components/admin-clip-cleanup";
import { isAdmin } from "@/lib/admin";
import { currentIdentityFresh } from "@/lib/auth";
import { adminClipCandidates } from "@/lib/moderation-service";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ days?: string; minSizeMb?: string }>;

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export default async function AdminCleanupPage({ searchParams }: { searchParams: SearchParams }) {
  const identity = await currentIdentityFresh();
  if (!identity) redirect("/sign-in?redirect_url=/admin/cleanup");
  if (!isAdmin(identity)) redirect("/dashboard");

  const params = await searchParams;
  const days = Math.trunc(boundedNumber(params.days, 7, 0, 36_500));
  const minSizeMb = boundedNumber(params.minSizeMb, 0, 0, 100_000);
  const candidates = await adminClipCandidates(days, Math.floor(minSizeMb * 1024 * 1024));

  return <div className="shell pb-24 pt-10">
    <Link href="/admin/reports" className="button-secondary mb-6"><ArrowLeft className="size-4" />Back to reports</Link>
    <header className="mb-8 flex items-start gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><ShieldCheck className="size-6" /></span>
      <div><p className="eyebrow">Admin tools</p><h1 className="mt-2 text-4xl font-black tracking-tight">Route cleanup</h1><p className="mt-2 max-w-2xl text-ink/50">Find old or large routes, notify owners with a warning on their route and dashboard, then review or remove routes manually.</p></div>
    </header>

    <form className="card mb-5 grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" method="get">
      <label className="text-sm font-semibold">At least this many days old
        <input className="field mt-2" type="number" name="days" min="0" max="36500" step="1" defaultValue={days} />
      </label>
      <label className="text-sm font-semibold">At least this much stored file data (MB)
        <input className="field mt-2" type="number" name="minSizeMb" min="0" max="100000" step="0.1" defaultValue={minSizeMb} />
      </label>
      <button className="button-primary">Filter routes</button>
      <p className="text-xs text-ink/45 sm:col-span-3">Both filters apply together. Size sums non-deleted attachments, including files pending cleanup. Routes without files count as 0 MB. Showing up to 200 routes.</p>
    </form>

    <AdminClipCleanup initialCandidates={candidates} />
  </div>;
}
