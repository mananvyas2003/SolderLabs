import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { BrandMark } from "@/components/brand-mark";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface-1)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2.5">
          <div className="flex items-center gap-5">
            <BrandMark href="/app" size="sm" />
            <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />
            <span className="hidden text-xs text-[var(--text-muted)] sm:inline">
              Hardware collaboration
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/admin/metrics"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Metrics
            </Link>
            <span className="text-xs text-[var(--text-muted)]">{user.name}</span>
            <form action="/api/auth/sign-out" method="POST">
              <SignOutButton />
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-6">{children}</div>
    </div>
  );
}

function SignOutButton() {
  return (
    <button
      formAction={async () => {
        "use server";
        const { cookies } = await import("next/headers");
        const { COOKIE } = await import("@/lib/auth");
        const { redirect } = await import("next/navigation");
        const jar = await cookies();
        jar.delete(COOKIE);
        redirect("/sign-in");
      }}
      className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
    >
      Sign out
    </button>
  );
}
