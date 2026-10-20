"use client";

import { useState } from "react";

export function ReportButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/clips/${slug}/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
    if (response.ok) { setStatus("Report received. Thank you."); setReason(""); }
    else setStatus("The report could not be submitted.");
  }
  return <div className="mt-8 text-center text-sm text-ink/45"><button className="underline hover:text-ink" onClick={() => setOpen((value) => !value)}>Report abuse</button>{open && <form onSubmit={submit} className="card mx-auto mt-3 max-w-lg space-y-3 p-4 text-left"><label className="label" htmlFor="report-reason">What is wrong with this clip?</label><textarea id="report-reason" className="field" minLength={10} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} /><button className="button-secondary w-full">Send report</button>{status && <p aria-live="polite">{status}</p>}</form>}</div>;
}
