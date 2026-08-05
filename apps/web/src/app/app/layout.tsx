import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <div className="flex items-center gap-6">
          <Link
            href="/app"
            className="text-xs font-semibold tracking-[0.22em] text-[var(--accent)]"
          >
            FLUX
          </Link>
          <span className="hidden text-xs text-[var(--text-muted)] md:inline">
            GitHub for Hardware
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/explore"
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Explore
          </Link>
          <span className="text-[var(--text-muted)]">{user.name}</span>
          <form action="/api/auth/sign-out" method="POST">
            <SignOutButton />
          </form>
        </div>
      </header>
      <div className="px-5 py-6">{children}</div>
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
