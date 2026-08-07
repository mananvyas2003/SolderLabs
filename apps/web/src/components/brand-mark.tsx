import Link from "next/link";
import { cx } from "@solderlab/ui";

/** Wordmark — ember mark + ink name. */
export function BrandMark({
  href = "/",
  size = "md",
  className,
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "text-[14px]",
    md: "text-[16px]",
    lg: "text-[22px]",
  } as const;
  const mark = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  } as const;

  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center gap-2 font-semibold tracking-tight text-[var(--text)] hover:opacity-80",
        sizes[size],
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "inline-block shrink-0 rounded-[2px] bg-[var(--accent)]",
          mark[size],
        )}
      />
      SolderLab
    </Link>
  );
}
