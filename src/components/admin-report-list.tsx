"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { useState } from "react";

type Report = {
  id: string;
  reason: string;
  status: "OPEN" | "REVIEWED" | "DISMISSED" | "ACTIONED";
  createdAt: string;
  reviewedAt: string | null;
  slug: string;
  clipStatus: string;
  textPreview: string | null;
};

export function AdminReportList({ initialReports }: { initialReports: Report[] }) {
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");

  async function act(report: Report, action: "review" | "dismiss" | "delete") {
    if (action === "delete" && !confirm(`Delete /${report.slug} because of this report?`)) return;
    setBusy(report.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/reports/${report.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json() as { status?: Report["status"]; error?: { message?: string } };
      if (!response.ok || !result.status) throw new Error(result.error?.message ?? "Moderation action failed.");
      setReports((current) => current.map((item) => item.id === report.id
        ? { ...item, status: result.status!, clipStatus: action === "delete" ? "DELETED" : item.clipStatus, reviewedAt: new Date().toISOString() }
        : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Moderation action failed.");
    } finally {
      setBusy(undefined);
    }
  }

  if (!reports.length) return <section className="card p-12 text-center"><CheckCircle2 className="mx-auto size-8 text-emerald-500" /><h2 className="mt-4 text-xl font-bold">No reports yet</h2><p className="mt-2 text-sm text-ink/50">New abuse reports will appear here.</p></section>;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-500/10 p-4 text-sm text-red-600" role="alert">{error}</p>}
      {reports.map((report) => (
        <article key={report.id} className="card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-black/10 p-5 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600"><ShieldAlert className="size-5" /></span>
              <div className="min-w-0"><h2 className="truncate text-lg font-bold">/{report.slug}</h2><p className="mt-1 text-xs text-ink/45">Reported {new Date(report.createdAt).toLocaleString()}</p></div>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${report.status === "OPEN" ? "bg-red-500/10 text-red-600" : "bg-black/5 text-ink/55 dark:bg-white/10"}`}>{report.status}</span>
          </div>
          <div className="grid gap-5 p-5 lg:grid-cols-2">
            <section><p className="eyebrow">Report reason</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{report.reason}</p></section>
            <section><p className="eyebrow">Clip text preview</p><div className="mt-2 max-h-48 overflow-auto rounded-xl bg-black/[.035] p-4 text-sm leading-6 dark:bg-white/[.05]">{report.textPreview || <span className="text-ink/40">No text content.</span>}</div></section>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-black/10 p-4 dark:border-white/10">
            {report.clipStatus !== "DELETED" && <Link href={`/${report.slug}`} target="_blank" className="button-secondary"><ExternalLink className="size-4" />Open route</Link>}
            <button className="button-secondary" disabled={busy === report.id} onClick={() => act(report, "review")}><CheckCircle2 className="size-4" />Mark reviewed</button>
            <button className="button-secondary" disabled={busy === report.id} onClick={() => act(report, "dismiss")}><XCircle className="size-4" />Dismiss</button>
            {report.clipStatus !== "DELETED" && <button className="button-secondary text-red-600" disabled={busy === report.id} onClick={() => act(report, "delete")}><Trash2 className="size-4" />Delete clip</button>}
          </div>
        </article>
      ))}
    </div>
  );
}
