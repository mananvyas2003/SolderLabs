import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[6px] px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50";
  const styles = {
    primary: "bg-[var(--accent)] text-[#1a1208] hover:brightness-110",
    ghost: "bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)]",
    danger: "bg-[var(--danger)] text-white hover:brightness-110",
    outline:
      "border border-[var(--border)] bg-transparent text-[var(--text)] hover:border-[var(--accent)]",
  } as const;
  return (
    <button className={cx(base, styles[variant], className)} {...props} />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warn" | "info" | "accent";
}) {
  const map = {
    neutral: "bg-[var(--surface-2)] text-[var(--text-muted)]",
    success: "bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)]",
    danger: "bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-[var(--danger)]",
    warn: "bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] text-[var(--warn)]",
    info: "bg-[color-mix(in_srgb,var(--info)_20%,transparent)] text-[var(--info)]",
    accent: "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)]",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        map[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-start justify-center gap-3 border border-dashed border-[var(--border)] px-8 py-12">
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="max-w-md text-sm text-[var(--text-muted)]">{body}</p>
      {action}
    </div>
  );
}
