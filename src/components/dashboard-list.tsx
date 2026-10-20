"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clipboard, ExternalLink, Trash2 } from "lucide-react";

type Item = { id: string; slug: string; expiryMode: string; expiresAt: string | null; consumedAt: string | null; status: string; createdAt: string };

export function DashboardList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string>();
  async function remove(slug: string) {
    if (!confirm(`Permanently delete /${slug}? This cannot be undone.`)) return;
    setDeleting(slug);
    const response = await fetch(`/api/clips/${slug}`, { method: "DELETE" });
    setDeleting(undefined);
    if (response.ok) router.refresh(); else alert("Could not delete this clip.");
  }
  return <div className="card mt-6 overflow-hidden"><ul className="divide-y divide-black/10 dark:divide-white/10">{items.map((item) => {
    const expired = item.expiresAt && new Date(item.expiresAt) <= new Date();
    const status = item.status === "DELETED" ? "Deleted" : item.status === "UPLOADING" ? "Uploading" : item.consumedAt ? "Consumed" : expired ? "Expired" : item.expiryMode === "FOREVER" ? "Forever" : "Active";
    return <li key={item.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><Link href={`/${item.slug}`} className="truncate text-lg font-bold hover:text-accent">/{item.slug}</Link><p className="mt-1 text-xs text-ink/45">Created {new Date(item.createdAt).toISOString().slice(0, 10)} · {status}</p></div><div className="flex gap-2"><button className="button-secondary px-3" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(`${location.origin}/${item.slug}`)}><Clipboard className="size-4" /></button><Link className="button-secondary px-3" href={`/${item.slug}`} aria-label="Open clip"><ExternalLink className="size-4" /></Link>{item.status !== "DELETED" && <button className="button-secondary px-3 text-red-600" disabled={deleting === item.slug} onClick={() => remove(item.slug)} aria-label="Delete clip"><Trash2 className="size-4" /></button>}</div></li>;
  })}</ul></div>;
}
