import Link from "next/link";

export default function OfflinePage() {
  return <div className="shell grid min-h-[65vh] place-items-center text-center"><div><p className="eyebrow">Offline</p><h1 className="mt-3 text-3xl font-black">You’re not connected.</h1><p className="mt-3 text-ink/55">Sensitive clips are never cached. Reconnect to open or create a link.</p><Link href="/" className="button-primary mt-6">Try again</Link></div></div>;
}
