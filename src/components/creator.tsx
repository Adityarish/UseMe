"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FileUp, LockKeyhole, Trash2 } from "lucide-react";
import { uploadAttachment } from "@/lib/client-upload";
import { PasswordField } from "./password-field";

const CodeEditor = dynamic(() => import("./code-editor").then((module) => module.CodeEditor), { ssr: false });
const languages = ["plain", "markdown", "json", "javascript", "typescript", "python", "java", "c", "c++", "html", "css", "sql", "bash"];
type Expiry = "ONCE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "FOREVER";
type Progress = Record<string, number>;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function Creator({ initialSlug, maxClipBytes, maxFiles }: { initialSlug: string; maxClipBytes: number; maxFiles: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("plain");
  const [viewPolicy, setViewPolicy] = useState<"PUBLIC" | "PASSWORD">("PUBLIC");
  const [viewPassword, setViewPassword] = useState("");
  const [viewPasswordConfirm, setViewPasswordConfirm] = useState("");
  const [editPolicy, setEditPolicy] = useState<"NONE" | "PUBLIC" | "PASSWORD">("NONE");
  const [editPassword, setEditPassword] = useState("");
  const [editPasswordConfirm, setEditPasswordConfirm] = useState("");
  const [expiryMode, setExpiryMode] = useState<Expiry>("DAY");
  const [progress, setProgress] = useState<Progress>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const overall = files.length ? Math.round(files.reduce((sum, file) => sum + (progress[file.name] ?? 0), 0) / files.length) : 0;

  function addFiles(incoming: FileList | File[]) {
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
    }
    if (next.length > maxFiles) { setError(`A clip can contain at most ${maxFiles} files.`); return; }
    if (next.reduce((sum, file) => sum + file.size, 0) > maxClipBytes) { setError(`Files exceed the ${formatBytes(maxClipBytes)} clip limit.`); return; }
    setError(""); setFiles(next);
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    let createdSlug: string | null = null;
    try {
      if (totalBytes > maxClipBytes) throw new Error(`Files exceed the ${formatBytes(maxClipBytes)} clip limit.`);
      if (viewPolicy === "PASSWORD" && viewPassword !== viewPasswordConfirm) throw new Error("View passwords do not match.");
      if (editPolicy === "PASSWORD" && editPassword !== editPasswordConfirm) throw new Error("Edit passwords do not match.");
      const response = await fetch("/api/clips", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: initialSlug, text, language, viewPolicy,
          viewPassword: viewPolicy === "PASSWORD" ? viewPassword : undefined,
          editPolicy, editPassword: editPolicy === "PASSWORD" ? editPassword : undefined,
          expiryMode,
          files: files.map((file) => ({ name: file.name, size: file.size, type: file.type || "application/octet-stream" })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Could not create the clip.");
      createdSlug = result.clip.slug as string;
      if (result.uploadSession) {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          await uploadAttachment({
            url: `/api/uploads/${result.uploadSession.id}/${result.attachments[index].id}`,
            token: result.uploadSession.token,
            file,
            onProgress: (percent) => setProgress((current) => ({ ...current, [file.name]: percent })),
          });
        }
        const finalized = await fetch(`/api/uploads/${result.uploadSession.id}/finalize`, {
          method: "POST", headers: { "x-upload-token": result.uploadSession.token },
        });
        if (!finalized.ok) {
          const failure = await finalized.json().catch(() => null) as { error?: { message?: string } } | null;
          throw new Error(failure?.error?.message ?? "Files uploaded, but publishing did not finish. Retry before the upload session expires.");
        }
      }
      router.push(`/${initialSlug}`);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      if (createdSlug && text.trim()) {
        setPublishedSlug(createdSlug);
        setError(`${message} Your text was published successfully; only the attachment failed.`);
      } else {
        setError(message);
      }
      setBusy(false);
    }
  }

  return (
    <div className="shell pb-24 pt-8">
      <div className="mx-auto max-w-4xl">
        <p className="eyebrow">Create a link</p>
        <h1 className="mt-3 break-all text-4xl font-black tracking-tight">/{initialSlug}</h1>
        <p className="mt-2 text-ink/55">Add text, files, or both. Text is available as soon as the link is created; attachments appear after their uploads finish.</p>
        <form onSubmit={publish} className="mt-8 space-y-6">
          <section className="card p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="eyebrow">Text or code</p><h2 className="mt-1 text-xl font-bold">Write something</h2></div>
              <select className="field w-auto py-2" value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Text language">
                {languages.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="mt-5"><CodeEditor value={text} language={language} onChange={setText} /></div>
          </section>

          <section className="card p-5 sm:p-7">
            <p className="eyebrow">Attachments</p>
            <button type="button" className="mt-4 flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-black/15 px-5 py-10 transition hover:border-accent hover:bg-accent/5 dark:border-white/15" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
              <FileUp className="size-8 text-accent" />
              <span className="mt-3 font-bold">Drop files here or browse</span>
              <span className="mt-1 text-sm text-ink/50">Up to {formatBytes(maxClipBytes)} total · {maxFiles} files</span>
            </button>
            <input ref={inputRef} type="file" multiple className="sr-only" onChange={(event) => event.target.files && addFiles(event.target.files)} />
            {files.length > 0 && <ul className="mt-4 space-y-2">
              {files.map((file, index) => <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 rounded-xl bg-black/[.035] p-3 dark:bg-white/[.05]">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.name}</p><p className="text-xs text-ink/45">{formatBytes(file.size)}{progress[file.name] !== undefined ? ` · ${progress[file.name]}%` : ""}</p></div>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4" /></button>
              </li>)}
            </ul>}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-5 sm:p-7">
              <p className="eyebrow">Who can open it?</p>
              <div className="mt-4 grid gap-2">
                {[["PUBLIC", "Anyone with the link"], ["PASSWORD", "Password protected"]].map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10"><input type="radio" checked={viewPolicy === value} onChange={() => setViewPolicy(value as typeof viewPolicy)} /><span>{label}</span></label>)}
              </div>
              {viewPolicy === "PASSWORD" && <div className="mt-4 space-y-3"><div><label className="label" htmlFor="view-password">View password</label><PasswordField id="view-password" className="field" minLength={8} required value={viewPassword} onChange={(event) => setViewPassword(event.target.value)} /></div><div><label className="label" htmlFor="view-password-confirm">Confirm password</label><PasswordField id="view-password-confirm" className="field" minLength={8} required value={viewPasswordConfirm} onChange={(event) => setViewPasswordConfirm(event.target.value)} /></div></div>}
            </section>
            <section className="card p-5 sm:p-7">
              <p className="eyebrow">Who can change it?</p>
              <div className="mt-4 grid gap-2">
                {[["NONE", "No one"], ["PUBLIC", "Anyone"], ["PASSWORD", "Password protected"]].map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10"><input type="radio" checked={editPolicy === value} onChange={() => setEditPolicy(value as typeof editPolicy)} /><span>{label}</span></label>)}
              </div>
              {editPolicy === "PASSWORD" && <div className="mt-4 space-y-3"><div><label className="label" htmlFor="edit-password">Separate edit password</label><PasswordField id="edit-password" className="field" minLength={8} required value={editPassword} onChange={(event) => setEditPassword(event.target.value)} /></div><div><label className="label" htmlFor="edit-password-confirm">Confirm edit password</label><PasswordField id="edit-password-confirm" className="field" minLength={8} required value={editPasswordConfirm} onChange={(event) => setEditPasswordConfirm(event.target.value)} /></div></div>}
            </section>
          </div>

          <section className="card p-5 sm:p-7">
            <p className="eyebrow">How long should this clip last?</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[["ONCE", "One view"], ["HOUR", "1 hour"], ["DAY", "24 hours"], ["WEEK", "7 days"], ["MONTH", "30 days"], ["FOREVER", "Forever"]].map(([value, label]) => <label key={value} className={`cursor-pointer rounded-xl border p-3 text-center text-sm font-semibold ${expiryMode === value ? "border-accent bg-accent/10 text-accent" : "border-black/10 dark:border-white/10"}`}><input className="sr-only" type="radio" checked={expiryMode === value} onChange={() => setExpiryMode(value as Expiry)} />{label}</label>)}
            </div>
          </section>

          {busy && files.length > 0 && <div className="h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-accent transition-all" style={{ width: `${overall}%` }} /></div>}
          {error && <div role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"><p>{error}</p>{publishedSlug && <Link className="mt-2 inline-block font-bold underline" href={`/${publishedSlug}`}>Open the published text</Link>}</div>}
          <button className="button-primary w-full text-base" disabled={busy || Boolean(publishedSlug) || (!text.trim() && files.length === 0)}>
            <LockKeyhole className="size-4" /> {busy ? "Publishing…" : "Publish secure link"}
          </button>
        </form>
      </div>
    </div>
  );
}
