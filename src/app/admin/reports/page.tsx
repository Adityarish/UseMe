import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AdminReportList } from "@/components/admin-report-list";
import { isAdmin } from "@/lib/admin";
import { currentIdentityFresh } from "@/lib/auth";
import { recentReports } from "@/lib/moderation-service";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const identity = await currentIdentityFresh();
  if (!identity) redirect("/sign-in?redirect_url=/admin/reports");
  if (!isAdmin(identity)) redirect("/dashboard");
  const reports = await recentReports();

  return (
    <div className="shell pb-24 pt-10">
      <div className="mb-8 flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><ShieldCheck className="size-6" /></span>
        <div><p className="eyebrow">Admin moderation</p><h1 className="mt-2 text-4xl font-black tracking-tight">Reported clips</h1><p className="mt-2 text-ink/50">Review user reports and remove abusive routes when necessary.</p></div>
      </div>
      <AdminReportList initialReports={reports} />
    </div>
  );
}
