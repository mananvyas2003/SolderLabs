"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cx } from "@solderlab/ui";

const TABS = [
  { id: "overview", label: "Overview", suffix: "" },
  { id: "history", label: "History", suffix: "/history" },
  { id: "files", label: "Files", suffix: "/files" },
  { id: "bom", label: "BOM", suffix: "/bom" },
  { id: "checks", label: "Checks", suffix: "/checks" },
  { id: "pinout", label: "Pinout", suffix: "/pinout" },
  { id: "reviews", label: "Reviews", suffix: "/reviews" },
  { id: "releases", label: "Releases", suffix: "/releases" },
  { id: "settings", label: "Settings", suffix: "/settings" },
] as const;

export function ProjectTabs({
  orgSlug,
  projectSlug,
}: {
  orgSlug: string;
  projectSlug: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const base = `/app/${orgSlug}/${projectSlug}`;

  // Warm all tab routes so the first click is often a cache hit.
  useEffect(() => {
    for (const tab of TABS) {
      router.prefetch(`${base}${tab.suffix}`);
    }
  }, [base, router]);

  // Clear optimistic state once the URL catches up.
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  function isActive(href: string, suffix: string) {
    if (pendingHref) return pendingHref === href;
    if (suffix === "") {
      return pathname === base || pathname === `${base}/`;
    }
    return (
      pathname === `${base}${suffix}` ||
      pathname.startsWith(`${base}${suffix}/`)
    );
  }

  return (
    <nav
      aria-label="Project"
      aria-busy={isPending || Boolean(pendingHref)}
      className="-mb-px flex gap-0 overflow-x-auto border-b border-[var(--border)]"
    >
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = isActive(href, tab.suffix);
        return (
          <Link
            key={tab.id}
            href={href}
            prefetch
            onClick={(e) => {
              if (
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey ||
                e.button !== 0
              ) {
                return;
              }
              // Instant chrome feedback before the RSC payload finishes.
              e.preventDefault();
              if (pathname === href || pendingHref === href) return;
              setPendingHref(href);
              startTransition(() => {
                router.push(href);
              });
            }}
            className={cx(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-[var(--accent)] font-medium text-[var(--accent-2)]"
                : "border-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
              (isPending || pendingHref) && !active ? "opacity-60" : null,
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
