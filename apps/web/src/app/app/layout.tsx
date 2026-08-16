import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@solderlab/db";
import { getSessionUser } from "@/lib/auth";
import { ensureDb } from "@/lib/ensure-db";
import { AppSidebar, type SidebarOrg } from "@/components/app-sidebar";
import { SignOutControl } from "@/components/sign-out-control";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  ensureDb();
  const db = getDb();
  const orgs: SidebarOrg[] = db.memberships
    .filter((m) => m.userId === user.id)
    .map((m) => db.organizations.find((o) => o.id === m.orgId))
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
    .map((o) => ({
      slug: o.slug,
      name: o.name,
      projects: db.projects
        .filter((p) => p.orgId === o.id)
        .map((p) => ({ slug: p.slug, name: p.name })),
    }));

  return (
    <div className="flex min-h-screen bg-[var(--surface-0)] text-[var(--text-soft)]">
      <AppSidebar orgs={orgs} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sl-glass sticky top-0 z-20 flex h-14 items-center justify-end gap-2 border-b border-[var(--border)] px-4 md:px-6">
          <span className="mr-auto pl-12 text-sm text-[var(--text-muted)] md:pl-0">
            {user.name}
          </span>
          <Link
            href="/app"
            className="rounded-[var(--radius-sm)] px-2.5 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
          >
            Home
          </Link>
          <SignOutControl />
        </header>
        <div className="min-w-0 flex-1 px-4 py-5 md:px-6">{children}</div>
      </div>
    </div>
  );
}
