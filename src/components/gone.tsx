import Link from "next/link";

export function Gone() {
  return <div className="shell grid min-h-[65vh] place-items-center py-12 text-center"><section><p className="eyebrow">Unavailable</p><h1 className="mt-3 text-3xl font-black">This link has expired or is no longer available.</h1><p className="mx-auto mt-3 max-w-lg text-ink/55">For privacy, we cannot say whether it expired, was consumed, or was removed.</p><Link href="/" className="button-primary mt-7">Go home</Link></section></div>;
}
