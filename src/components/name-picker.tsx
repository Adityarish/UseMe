"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type State = "idle" | "checking" | "available" | "exists" | "invalid";

export function NamePicker() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, setState] = useState<State>("idle");
  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("checking");
      try {
        const response = await fetch(`/api/slugs/check?slug=${encodeURIComponent(slug)}`, { signal: controller.signal });
        if (!response.ok) { setState("invalid"); return; }
        const result = await response.json() as { available: boolean };
        setState(result.available ? "available" : "exists");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState("invalid");
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [slug]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "available" || state === "exists") router.push(`/${slug}`);
  }

  const message = {
    idle: "Use 1–48 letters, numbers, and hyphens.",
    checking: "Checking…",
    available: "Available — make it yours.",
    exists: "This link exists — open it.",
    invalid: "Choose another name.",
  }[state];

  return (
    <form onSubmit={submit} className="mx-auto mt-10 max-w-3xl" aria-label="Open or create a link">
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center rounded-2xl bg-black/[.035] px-4 dark:bg-white/[.055]">
          <span className="hidden text-sm text-ink/45 sm:block">useme.app/</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!event.target.value.trim()) setState("idle");
            }}
            className="min-w-0 flex-1 bg-transparent px-1 py-4 text-lg font-semibold outline-none"
            placeholder="your-custom-name"
            autoComplete="off"
            aria-describedby="name-status"
          />
        </div>
        <button className="button-primary whitespace-nowrap" disabled={!(["available", "exists"] as State[]).includes(state)}>
          Open / Continue <span aria-hidden>→</span>
        </button>
      </div>
      <p id="name-status" aria-live="polite" className={`mt-3 text-sm ${state === "available" ? "text-emerald-600" : state === "invalid" ? "text-red-600" : "text-ink/55"}`}>{message}</p>
    </form>
  );
}
