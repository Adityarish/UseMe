"use client";

import Link from "next/link";
import { FilePenLine, FilePlus2, FileX2, History, LoaderCircle, Paperclip, Trash2 } from "lucide-react";
import { useState } from "react";

type ActivityItem = {
  id: number;
  action: "CREATED" | "UPDATED" | "DELETED" | "FILES_ADDED" | "FILE_REMOVED";
  slug: string;
  detail: string | null;
  createdAt: string;
};

type ActivityPage = { items: ActivityItem[]; nextCursor: string | null };

const presentation = {
  CREATED: { label: "Created", icon: FilePlus2, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  UPDATED: { label: "Updated", icon: FilePenLine, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  DELETED: { label: "Deleted", icon: Trash2, tone: "bg-red-500/10 text-red-600 dark:text-red-400" },
  FILES_ADDED: { label: "Files added", icon: Paperclip, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  FILE_REMOVED: { label: "File removed", icon: FileX2, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
} as const;

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ActivityFeed({ initial }: { initial: ActivityPage }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/me/activity?cursor=${encodeURIComponent(cursor)}`);
      const page = await response.json() as ActivityPage & { error?: { message?: string } };
      if (!response.ok) throw new Error(page.error?.message ?? "Could not load more activity.");
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more activity.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-black/10 px-5 py-4 dark:border-white/10">
        <span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent"><History className="size-4" /></span>
        <div><h2 className="font-bold">Recent activity</h2><p className="text-xs text-ink/45">Your latest workspace changes</p></div>
      </div>
      {items.length ? (
        <ol className="divide-y divide-black/[.07] dark:divide-white/[.07]">
          {items.map((item) => {
            const meta = presentation[item.action];
            const Icon = meta.icon;
            return (
              <li key={item.id} className="flex gap-3 px-5 py-4">
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${meta.tone}`}><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-semibold">{meta.label}</span>{" "}{item.action === "DELETED" ? <span className="font-bold text-ink/55">/{item.slug}</span> : <Link className="font-bold hover:text-accent" href={`/${item.slug}`}>/{item.slug}</Link>}</p>
                  {item.detail && <p className="mt-0.5 truncate text-xs text-ink/50">{item.detail}</p>}
                  <time className="mt-1 block text-[11px] text-ink/35" dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
                </div>
              </li>
            );
          })}
        </ol>
      ) : <div className="px-5 py-10 text-center text-sm text-ink/45">Your activity will appear here.</div>}
      {error && <p className="mx-5 mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600" role="alert">{error}</p>}
      {cursor && <div className="border-t border-black/10 p-4 dark:border-white/10"><button className="button-secondary w-full" disabled={loading} onClick={loadMore}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : null}{loading ? "Loading…" : "Load 10 more"}</button></div>}
    </section>
  );
}
