"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clipboard, Download, Eye, FilePlus2, KeyRound, Pencil, Save, X } from "lucide-react";
import { uploadAttachments } from "@/lib/client-upload";
import { ReportButton } from "./report-button";

const CodeEditor = dynamic(() => import("./code-editor").then((module) => module.CodeEditor), { ssr: false });

type FileItem = { id: string; name: string; size: number; mimeType: string };
type ClipData = {
  id: string; slug: string; text: string | null; language: string; expiryMode: string;
  expiresAt: string | null; version: number; files: FileItem[]; editAccess: "ALLOWED" | "PASSWORD" | "NONE";
};

function formatBytes(bytes: number) {
  return bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown expiration";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Request failed.");
  return result;
}

export function Viewer({ access, clip }: { access: "PASSWORD" | "REVEAL" | "AUTHORIZED"; clip: Partial<ClipData> & { slug: string } }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(clip.text ?? "");
  const [version, setVersion] = useState(clip.version ?? 1);
  const [editAccess, setEditAccess] = useState(clip.editAccess);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [displayFiles, setDisplayFiles] = useState(fullFiles(clip));

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Request failed."); }
    finally { setBusy(false); }
  }

  if (access === "PASSWORD") return (
    <Gate title="This link is protected" copy="Enter the password to see any content or file details." error={error}>
      <form onSubmit={(event) => { event.preventDefault(); run(() => post(`/api/clips/${clip.slug}/unlock`, { password })); }} className="mt-6 space-y-3">
        <input className="field" type="password" autoFocus required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        <button className="button-primary w-full" disabled={busy}><KeyRound className="size-4" />{busy ? "Unlocking…" : "Unlock"}</button>
      </form>
    </Gate>
  );

  if (access === "REVEAL") return (
    <Gate title="Ready when you are" copy="This is a one-time link. Opening this page did not consume it. Explicitly reveal it when you are ready; this independent view cannot be repeated." error={error}>
      <button onClick={() => run(() => post(`/api/clips/${clip.slug}/reveal`))} className="button-primary mt-6 w-full" disabled={busy}><Eye className="size-4" />{busy ? "Claiming…" : "Reveal content"}</button>
    </Gate>
  );

  const full = clip as ClipData;
  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/clips/${full.slug}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language: full.language, version }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Could not save changes.");
      let nextVersion = result.version as number;
      setVersion(nextVersion);
      if (newFiles.length) {
        const reservationResponse = await fetch(`/api/clips/${full.slug}/uploads`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: nextVersion, files: newFiles.map((file) => ({ name: file.name, size: file.size, type: file.type || "application/octet-stream" })) }),
        });
        const reservation = await reservationResponse.json();
        if (!reservationResponse.ok) throw new Error(reservation.error?.message ?? "Could not reserve attachment uploads.");
        nextVersion = reservation.version;
        setVersion(nextVersion);
        await uploadAttachments(newFiles.map((file, index) => ({
            url: `/api/uploads/${reservation.uploadSession.id}/${reservation.attachments[index].id}`,
            token: reservation.uploadSession.token,
            file,
          })));
        const finalized = await fetch(`/api/uploads/${reservation.uploadSession.id}/finalize`, { method: "POST", headers: { "x-upload-token": reservation.uploadSession.token } });
        if (!finalized.ok) {
          const failure = await finalized.json().catch(() => null) as { error?: { message?: string } } | null;
          throw new Error(failure?.error?.message ?? "Files uploaded, but finalization did not finish.");
        }
        setDisplayFiles((current) => [...current, ...reservation.attachments.map((attachment: { id: string; name: string; size: number }, index: number) => ({ ...attachment, mimeType: newFiles[index].type || "application/octet-stream" }))]);
      }
      setVersion(nextVersion); setNewFiles([]); setEditing(false); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save changes."); }
    finally { setBusy(false); }
  }
  async function removeExisting(file: FileItem) {
    if (!confirm(`Remove ${file.name}?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/clips/${full.slug}/attachments/${file.id}/manage`, {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ version }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Could not remove the file.");
      setVersion(result.version); setDisplayFiles((files) => files.filter((item) => item.id !== file.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not remove the file."); }
    finally { setBusy(false); }
  }
  function downloadText() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${full.slug}.txt`; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="shell pb-24 pt-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow">Shared clip</p><h1 className="mt-2 break-all text-4xl font-black tracking-tight">/{full.slug}</h1><p className="mt-2 text-sm text-ink/50">{full.expiryMode === "FOREVER" ? "No expiration" : full.expiryMode === "ONCE" ? "One-time viewer session active" : `Expires ${formatExpiry(full.expiresAt!)}`}</p></div>
          <button className="button-secondary" onClick={() => copy(location.href)}>{copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}{copied ? "Copied" : "Copy link"}</button>
        </div>
        {(full.text !== null || editAccess === "ALLOWED") && <section className="card mt-8 p-5 sm:p-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">{full.language}</p><h2 className="mt-1 text-xl font-bold">Shared text</h2></div><div className="flex gap-2">
            <button className="button-secondary px-3" onClick={() => copy(text)}><Clipboard className="size-4" />Copy</button>
            <button className="button-secondary px-3" onClick={downloadText}><Download className="size-4" />Text file</button>
            {editAccess === "ALLOWED" && <button className="button-secondary px-3" onClick={() => editing ? save() : setEditing(true)} disabled={busy}>{editing ? <Save className="size-4" /> : <Pencil className="size-4" />}{editing ? "Save" : "Edit"}</button>}
          </div></div>
          <CodeEditor value={text} language={full.language} onChange={setText} readOnly={!editing} />
          {editing && <div className="mt-4 rounded-2xl border border-dashed border-black/15 p-4 dark:border-white/15"><label className="button-secondary cursor-pointer"><FilePlus2 className="size-4" />Add attachments<input type="file" multiple className="sr-only" onChange={(event) => setNewFiles(Array.from(event.target.files ?? []))} /></label>{newFiles.length > 0 && <ul className="mt-3 space-y-2">{newFiles.map((file, index) => <li key={`${file.name}-${file.size}`} className="flex items-center justify-between text-sm"><span className="truncate">{file.name} · {formatBytes(file.size)}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setNewFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}><X className="size-4" /></button></li>)}</ul>}</div>}
        </section>}
        {editAccess === "PASSWORD" && <section className="card mt-5 p-5"><form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); run(async () => { await post(`/api/clips/${full.slug}/edit-unlock`, { password: editPassword }); setEditAccess("ALLOWED"); }); }}><input className="field" type="password" required value={editPassword} onChange={(event) => setEditPassword(event.target.value)} placeholder="Edit password" /><button className="button-secondary shrink-0">Unlock editing</button></form></section>}
        {displayFiles.length > 0 && <section className="card mt-5 p-5 sm:p-7"><p className="eyebrow">Attachments</p><h2 className="mt-1 text-xl font-bold">{displayFiles.length} file{displayFiles.length === 1 ? "" : "s"}</h2><ul className="mt-4 divide-y divide-black/10 dark:divide-white/10">{displayFiles.map((file) => <li key={file.id} className="flex items-center gap-3 py-4 sm:gap-4"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{file.name}</p><p className="text-xs text-ink/45">{formatBytes(file.size)}</p></div><a className="button-secondary px-3" href={`/api/clips/${full.slug}/attachments/${file.id}?preview=1`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name} in a new tab`} title="Open preview"><Eye className="size-4" /></a>{editing && <button className="button-secondary px-3 text-red-600" disabled={busy} onClick={() => removeExisting(file)} aria-label={`Remove ${file.name}`}><X className="size-4" /></button>}<Link className="button-secondary px-3 sm:px-4" href={`/api/clips/${full.slug}/attachments/${file.id}`}><Download className="size-4" /><span className="hidden sm:inline">Download</span></Link></li>)}</ul></section>}
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <ReportButton slug={full.slug} />
      </div>
    </div>
  );
}

function fullFiles(clip: Partial<ClipData>): FileItem[] {
  return clip.files ?? [];
}

function Gate({ title, copy, error, children }: { title: string; copy: string; error: string; children: React.ReactNode }) {
  return <div className="shell grid min-h-[65vh] place-items-center py-12"><section className="card w-full max-w-md p-7 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent"><KeyRound /></div><h1 className="mt-5 text-2xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-ink/55">{copy}</p>{children}{error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}</section></div>;
}
