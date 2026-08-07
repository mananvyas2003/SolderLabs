"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cx } from "@solderlab/ui";
import { BrandMark } from "@/components/brand-mark";

export type SidebarOrg = {
  slug: string;
  name: string;
  projects: Array<{ slug: string; name: string }>;
};

export function AppSidebar({ orgs }: { orgs: SidebarOrg[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  function isActive(href: string) {
    const current = pendingHref ?? pathname;
    return current === href || current.startsWith(`${href}/`);
  }

  function navigate(e: React.MouseEvent, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    setMobileOpen(false);
    if (pathname === href || pendingHref === href) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center border-b border-[var(--border)] px-3">
        <BrandMark href="/app" size="sm" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
          Organizations
        </p>
        {orgs.length === 0 ? (
          <p className="px-2 text-xs text-[var(--text-muted)]">No orgs yet</p>
        ) : (
          <ul className="space-y-3">
            {orgs.map((org) => {
              const orgHref = `/app/${org.slug}`;
              const orgOpen = isActive(orgHref);
              return (
                <li key={org.slug}>
                  <Link
                    href={orgHref}
                    prefetch
                    onClick={(e) => navigate(e, orgHref)}
                    className={cx(
                      "flex items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-sm font-semibold",
                      orgOpen && (pendingHref ?? pathname) === orgHref
                        ? "bg-[var(--surface-2)] text-[var(--text)]"
                        : "text-[var(--text)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    {org.name}
                  </Link>
                  <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-[var(--border)] pl-2">
                    {org.projects.map((p) => {
                      const href = `/app/${org.slug}/${p.slug}`;
                      const active = isActive(href);
                      return (
                        <li key={p.slug}>
                          <Link
                            href={href}
                            prefetch
                            onClick={(e) => navigate(e, href)}
                            className={cx(
                              "block truncate rounded-[var(--radius-sm)] px-2 py-1 text-[13px]",
                              active
                                ? "bg-[var(--accent-muted)] font-semibold text-[var(--accent-2)]"
                                : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                              isPending && !active ? "opacity-60" : null,
                            )}
                          >
                            {p.name}
                          </Link>
                        </li>
                      );
                    })}
                    {orgOpen ? (
                      <li className="space-y-0.5 pt-1">
                        {(
                          [
                            ["Library", "library"],
                            ["Activity", "activity"],
                            ["Webhooks", "webhooks"],
                          ] as const
                        ).map(([label, seg]) => {
                          const href = `/app/${org.slug}/${seg}`;
                          return (
                            <Link
                              key={seg}
                              href={href}
                              prefetch
                              onClick={(e) => navigate(e, href)}
                              className={cx(
                                "block rounded-[var(--radius-sm)] px-2 py-1 text-[12px]",
                                isActive(href)
                                  ? "font-medium text-[var(--text)]"
                                  : "text-[var(--text-subtle)] hover:text-[var(--text)]",
                              )}
                            >
                              {label}
                            </Link>
                          );
                        })}
                      </li>
                    ) : null}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-0.5 border-t border-[var(--border)] p-2">
        <Link
          href="/docs"
          className="block rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          Docs
        </Link>
        <Link
          href="/admin/metrics"
          className="block rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          Metrics
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-40 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs font-medium md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        Menu
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 border-r border-[var(--border)] bg-[var(--surface-1)] shadow-sm">
            {nav}
          </div>
        </div>
      ) : null}

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-[var(--border)] bg-[var(--surface-1)] md:block">
        {nav}
      </aside>
    </>
  );
}
