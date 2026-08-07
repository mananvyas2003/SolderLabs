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
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50";
  const styles = {
    primary:
      "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]",
    ghost:
      "bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)]",
    danger: "bg-[var(--danger)] text-white hover:brightness-95",
    outline:
      "border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text)] hover:bg-[var(--surface-2)]",
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
        "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-muted)]",
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
    neutral:
      "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]",
    success:
      "border border-transparent bg-[color-mix(in_srgb,var(--success)_12%,white)] text-[var(--success)]",
    danger:
      "border border-transparent bg-[color-mix(in_srgb,var(--danger)_12%,white)] text-[var(--danger)]",
    warn:
      "border border-transparent bg-[color-mix(in_srgb,var(--warn)_14%,white)] text-[var(--warn)]",
    info:
      "border border-transparent bg-[color-mix(in_srgb,var(--info)_12%,white)] text-[var(--info)]",
    accent:
      "border border-transparent bg-[var(--accent-muted)] text-[var(--accent-2)]",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs font-medium",
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
    <div className="flex min-h-[200px] flex-col items-start justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-6 py-10">
      <h3 className="text-base font-semibold tracking-tight text-[var(--text)]">
        {title}
      </h3>
      <p className="max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
        {body}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
