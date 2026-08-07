import Link from "next/link";
import { cx } from "@solderlab/ui";

/** Wordmark — accent mark + ink name. Flat, no glow. */
export function BrandMark({
  href = "/",
  size = "md",
  className,
}: {
  href?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizes =
    size === "sm"
      ? "text-[13px] tracking-tight"
      : "text-[15px] tracking-tight";

  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center gap-1.5 font-semibold text-[var(--text)] hover:opacity-90",
        sizes,
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-[2px] bg-[var(--accent)]"
      />
      SolderLab
    </Link>
  );
}
