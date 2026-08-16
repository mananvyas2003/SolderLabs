import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  const base =
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-2)] active:opacity-90 disabled:pointer-events-none disabled:opacity-50";
  const styles = {
    primary:
      "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]",
    ghost:
      "bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
    danger:
      "bg-[var(--danger-bg)] text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] hover:brightness-110",
    outline:
      "border border-[var(--border)] bg-transparent text-[var(--text-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)]",
  } as const;
  return (
    <button
      type={type}
      className={cx(base, styles[variant], className)}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-inset)] px-3 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:shadow-[0_0_0_2px_var(--accent-muted)]",
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
      "border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)]",
    success:
      "border border-transparent bg-[var(--success-bg)] text-[var(--success)]",
    danger:
      "border border-transparent bg-[var(--danger-bg)] text-[var(--danger)]",
    warn: "border border-transparent bg-[var(--warn-bg)] text-[var(--warn)]",
    info: "border border-transparent bg-[var(--info-bg)] text-[var(--info)]",
    accent:
      "border border-transparent bg-[var(--accent-muted)] text-[var(--accent-2)]",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[var(--radius-sm)] px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
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
      <h3 className="text-base font-medium tracking-tight text-[var(--text)]">
        {title}
      </h3>
      <p className="max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
        {body}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
