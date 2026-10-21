"use client";

import Link from "next/link";
import { Bell, Eye, Trash2 } from "lucide-react";
import { useState } from "react";

type Candidate = {
  id: string;
  slug: string;
  createdAt: string;
  deletionNoticeAt: string | null;
  sizeBytes: number;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes ? 1 : 0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function AdminClipCleanup({ initialCandidates }: { initialCandidates: Candidate[] }) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");

  async function act(candidate: Candidate, action: "notify" | "delete") {
    if (action === "delete" && !confirm(`Permanently delete /${candidate.slug} and its stored files? This cannot be undone.`)) return;
    setBusy(candidate.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/clips/${candidate.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json() as { deletionNoticeAt?: string; cleanupPending?: boolean; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Admin action failed.");
      if (action === "delete") {
        setCandidates((current) => current.filter((item) => item.id !== candidate.id));
        if (result.cleanupPending) setError(`/${candidate.slug} was removed, but one or more Drive files could not be deleted and will need cleanup.`);
      } else {
        setCandidates((current) => current.map((item) => item.id === candidate.id
          ? { ...item, deletionNoticeAt: result.deletionNoticeAt ?? new Date().toISOString() }
          : item));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Admin action failed.");
    } finally {
      setBusy(undefined);
    }
  }

  return <section className="space-y-4">
    {error && <p className="rounded-xl bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
    {!candidates.length
      ? <div className="card p-10 text-center"><p className="font-bold">No routes match these filters</p><p className="mt-1 text-sm text-ink/45">Try a lower age or file-size threshold.</p></div>
      : <div className="card overflow-hidden"><ul className="divide-y divide-black/10 dark:divide-white/10">
        {candidates.map((item) => <li key={item.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-lg font-bold">/{item.slug}</span>
              {item.deletionNoticeAt && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Owner notified</span>}
            </div>
            <p className="mt-1 text-xs text-ink/45">Created {new Date(item.createdAt).toLocaleDateString()} · {formatBytes(item.sizeBytes)} attached</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary" disabled={busy === item.id || Boolean(item.deletionNoticeAt)} onClick={() => act(item, "notify")}><Bell className="size-4" />{item.deletionNoticeAt ? "Notified" : "Notify"}</button>
            <Link className="button-secondary" href={`/${item.slug}`} target="_blank" rel="noopener noreferrer"><Eye className="size-4" />View</Link>
            <button className="button-secondary text-red-600" disabled={busy === item.id} onClick={() => act(item, "delete")}><Trash2 className="size-4" />Delete</button>
          </div>
        </li>)}
      </ul></div>}
  </section>;
}
