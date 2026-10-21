import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, HardDrive, Plus, Search } from "lucide-react";
import { currentIdentity, supabaseConfigured } from "@/lib/auth";
import { userActivity } from "@/lib/activity-service";
import { ownedClips } from "@/lib/clip-service";
import { ActivityFeed } from "@/components/activity-feed";
import { DashboardList } from "@/components/dashboard-list";

export const dynamic = "force-dynamic";
type SearchParams = Promise<{ q?: string; sort?: string; page?: string }>;

function formatBytes(bytes: number) {
  return bytes < 1024 ** 2
    ? `${(bytes / 1024).toFixed(bytes ? 1 : 0)} KB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  if (!supabaseConfigured()) {
    return <div className="shell py-20"><section className="card mx-auto max-w-xl p-8 text-center"><h1 className="text-2xl font-black">Authentication is not configured</h1><p className="mt-3 text-ink/55">Add the Supabase URL and publishable key from .env.example to enable owner dashboards.</p></section></div>;
  }

  const identity = await currentIdentity();
  if (!identity) redirect("/sign-in?redirect_url=/dashboard");

  const params = await searchParams;
  const sort = params.sort === "oldest" ? "oldest" : "newest";
  const query = params.q?.slice(0, 100) ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const [data, activity] = await Promise.all([
    ownedClips(identity.userId, query, sort, page),
    userActivity(identity.userId),
  ]);

  const serializedItems = data.items.map((item) => ({
    ...item,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    consumedAt: item.consumedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    deletionNoticeAt: item.deletionNoticeAt?.toISOString() ?? null,
  }));

  return (
    <div className="shell pb-24 pt-8 sm:pt-12">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Welcome back{identity.displayName ? `, ${identity.displayName.split(" ")[0]}` : ""}.</h1>
          <p className="mt-3 text-ink/50">Create, manage, and review your shared links.</p>
        </div>
        <Link className="button-primary shrink-0" href="/"><Plus className="size-4" />Create a new link</Link>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:max-w-2xl">
        <section className="card flex items-center gap-4 p-5">
          <span className="grid size-11 place-items-center rounded-2xl bg-accent/10 text-accent"><FileText className="size-5" /></span>
          <div><p className="text-2xl font-black">{data.total}</p><p className="text-sm text-ink/45">Active clips</p></div>
        </section>
        <section className="card flex items-center gap-4 p-5">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400"><HardDrive className="size-5" /></span>
          <div><p className="text-2xl font-black">{formatBytes(data.bytes)}</p><p className="text-sm text-ink/45">Files stored</p></div>
        </section>
      </div>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-4">
          <form className="card flex flex-col gap-3 p-3 sm:flex-row" role="search">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink/35" />
              <input name="q" defaultValue={query} className="field pl-10" placeholder="Search your clips" aria-label="Search your clips" />
            </label>
            <select name="sort" defaultValue={sort} className="field sm:w-36" aria-label="Sort clips">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button className="button-primary sm:px-6">Apply</button>
          </form>

          <DashboardList items={serializedItems} />

          {data.total > data.pageSize && (
            <nav className="flex justify-center gap-2" aria-label="Clip pages">
              {data.page > 1 && <PageLink href={`/dashboard?page=${data.page - 1}&q=${encodeURIComponent(query)}&sort=${sort}`}>Previous</PageLink>}
              {data.page * data.pageSize < data.total && <PageLink href={`/dashboard?page=${data.page + 1}&q=${encodeURIComponent(query)}&sort=${sort}`}>Next</PageLink>}
            </nav>
          )}
        </section>

        <ActivityFeed key={activity.items[0]?.id ?? "empty"} initial={activity} />
      </div>
    </div>
  );
}

function PageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="button-secondary">{children}</Link>;
}
