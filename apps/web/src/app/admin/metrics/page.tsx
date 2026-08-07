import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { MetricsDashboard } from "@/components/metrics-dashboard";

export default async function AdminMetricsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)]">Internal</p>
          <h1 className="text-2xl font-semibold text-[var(--text)]">
            Product metrics
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--text-muted)]">
            Only wedge signals — parse health, BSC pulls, and CI check failures
            that caught firmware impact.
          </p>
        </div>
        <Link
          href="/app"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ← App
        </Link>
      </div>
      <MetricsDashboard />
    </div>
  );
}
