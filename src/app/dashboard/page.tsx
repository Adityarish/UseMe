import { redirect } from "next/navigation";
import { currentIdentity, supabaseConfigured } from "@/lib/auth";
import { ownedClips } from "@/lib/clip-service";
import { DashboardList } from "@/components/dashboard-list";

export const dynamic = "force-dynamic";
type Search = Promise<{ q?: string; sort?: string; page?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: Search }) {
  if (!supabaseConfigured()) return <div className="shell py-20"><section className="card mx-auto max-w-xl p-8 text-center"><h1 className="text-2xl font-black">Authentication is not configured</h1><p className="mt-3 text-ink/55">Add the Supabase URL and publishable key from .env.example to enable owner dashboards.</p></section></div>;
  const identity = await currentIdentity();
  if (!identity) redirect("/sign-in?redirect_url=/dashboard");
  const params = await searchParams;
  const sort = params.sort === "oldest" ? "oldest" : "newest";
  const data = await ownedClips(identity.userId, params.q?.slice(0, 100) ?? "", sort, Math.max(1, Number(params.page) || 1));
  return <div className="shell pb-24 pt-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Your workspace</p><h1 className="mt-2 text-4xl font-black">My clips</h1><p className="mt-2 text-ink/50">{data.total} clips · {(data.bytes / 1024 ** 2).toFixed(1)} MB stored</p></div><form className="flex gap-2"><input name="q" defaultValue={params.q} className="field w-52" placeholder="Search names" /><select name="sort" defaultValue={sort} className="field w-auto"><option value="newest">Newest</option><option value="oldest">Oldest</option></select><button className="button-primary">Filter</button></form></div>{data.items.length ? <DashboardList items={data.items.map((item) => ({ ...item, expiresAt: item.expiresAt?.toISOString() ?? null, consumedAt: item.consumedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString() }))} /> : <div className="card mt-6 p-12 text-center text-ink/50">No clips found.</div>}{data.total > data.pageSize && <nav className="mt-6 flex justify-center gap-2">{data.page > 1 && <LinkButton href={`/dashboard?page=${data.page - 1}&q=${encodeURIComponent(params.q ?? "")}&sort=${sort}`}>Previous</LinkButton>}{data.page * data.pageSize < data.total && <LinkButton href={`/dashboard?page=${data.page + 1}&q=${encodeURIComponent(params.q ?? "")}&sort=${sort}`}>Next</LinkButton>}</nav>}</div>;
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} className="button-secondary">{children}</a>;
}
