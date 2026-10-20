import { Clock3, FileText, ShieldCheck, type LucideIcon } from "lucide-react";
import { NamePicker } from "@/components/name-picker";

const features: Array<{ icon: LucideIcon; title: string; copy: string }> = [
  { icon: FileText, title: "Anything together", copy: "Text, code, documents, images, and archives in the same link." },
  { icon: ShieldCheck, title: "Private by design", copy: "Password protection and server-authorized downloads keep storage hidden." },
  { icon: Clock3, title: "Your timing", copy: "One view, one hour, one month, or forever when you sign in." },
];

export default function HomePage() {
  return (
    <div className="shell pb-24 pt-16 text-center sm:pt-24">
      <p className="eyebrow">Files + text · one clean link</p>
      <h1 className="mx-auto mt-5 max-w-4xl text-balance text-5xl font-black tracking-[-.055em] sm:text-7xl">
        Share anything, <span className="text-accent">instantly.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-ink/60 sm:text-xl">
        Choose a name. Add files or text. Share one simple link.
      </p>
      <NamePicker />
      <div className="mx-auto mt-24 grid max-w-4xl gap-4 text-left sm:grid-cols-3">
        {features.map(({ icon: Icon, title, copy }) => (
          <article key={title} className="card p-6">
            <Icon className="size-6 text-accent" aria-hidden />
            <h2 className="mt-4 font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink/55">{copy}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
