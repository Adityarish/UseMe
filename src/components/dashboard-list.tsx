"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clipboard, ExternalLink, Trash2 } from "lucide-react";

type Item = { id: string; slug: string; expiryMode: string; expiresAt: string | null; consumedAt: string | null; status: string; createdAt: string };

export function DashboardList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [deleting, setDeleting] = useState<string>();
  const [copied, setCopied] = useState<string>();
  async function remove(slug: string) {
    if (!confirm(`Permanently delete /${slug}? This cannot be undone.`)) return;
    setDeleting(slug);
    const response = await fetch(`/api/clips/${slug}`, { method: "DELETE" });
    setDeleting(undefined);
    if (response.ok) {
      setRows((current) => current.filter((item) => item.slug !== slug));
      router.refresh();
    } else alert("Could not delete this clip.");
  }
  async function copyLink(slug: string) {
    await navigator.clipboard.writeText(`${location.origin}/${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied((current) => current === slug ? undefined : current), 1500);
  }
  if (!rows.length) return <div className="card p-10 text-center"><p className="font-bold">No clips here</p><p className="mt-1 text-sm text-ink/45">Create a new link to start filling your workspace.</p></div>;
  return <div className="card overflow-hidden"><ul className="divide-y divide-black/10 dark:divide-white/10">{rows.map((item) => {
    const expired = item.expiresAt && new Date(item.expiresAt) <= new Date();
    const status = item.status === "DELETED" ? "Deleted" : item.status === "UPLOADING" ? "Uploading" : item.consumedAt ? "Consumed" : expired ? "Expired" : item.expiryMode === "FOREVER" ? "Forever" : "Active";
    const statusTone = status === "Active" || status === "Forever"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "Uploading"
        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    return <li key={item.id} className="flex flex-col gap-4 p-5 transition hover:bg-black/[.02] dark:hover:bg-white/[.025] sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Link href={`/${item.slug}`} className="truncate text-lg font-bold hover:text-accent">/{item.slug}</Link><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusTone}`}>{status}</span></div><p className="mt-1 text-xs text-ink/45">Created {new Date(item.createdAt).toLocaleDateString()}</p></div><div className="flex gap-2"><button className="button-secondary px-3" aria-label="Copy link" onClick={() => copyLink(item.slug)}>{copied === item.slug ? <Check className="size-4 text-emerald-600" /> : <Clipboard className="size-4" />}</button><Link className="button-secondary px-3" href={`/${item.slug}`} aria-label="Open clip"><ExternalLink className="size-4" /></Link><button className="button-secondary px-3 text-red-600" disabled={deleting === item.slug} onClick={() => remove(item.slug)} aria-label="Delete clip"><Trash2 className="size-4" /></button></div></li>;
  })}</ul></div>;
}
