"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@solderlab/ui";
import { AiChatThread } from "@/components/ai-chat-thread";
import { CopilotMark } from "@/components/copilot-mark";

export function AiAssistantDock({
  orgSlug,
  projectSlug,
}: {
  orgSlug: string;
  projectSlug: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const assistantHref = `/app/${orgSlug}/${projectSlug}/assistant`;
  const onAssistantPage =
    pathname === assistantHref || pathname.startsWith(`${assistantHref}/`);

  useEffect(() => {
    setSlot(document.getElementById("solderlab-assistant-slot"));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (onAssistantPage) return null;

  const trigger = (
    <button
      type="button"
      aria-label={open ? "Hide assistant" : "Open assistant"}
      aria-expanded={open}
      title="Assistant (Ctrl+J)"
      onClick={() => setOpen((v) => !v)}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        open
          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
          : "bg-[var(--surface-elevated)] text-[var(--accent-2)] ring-1 ring-[var(--border)] hover:bg-[var(--accent-muted)] hover:text-[var(--text)]",
      )}
    >
      <CopilotMark size={16} />
    </button>
  );

  return (
    <>
      {slot ? createPortal(trigger, slot) : (
        <div className="fixed right-4 top-2.5 z-50">{trigger}</div>
      )}

      <div
        role="dialog"
        aria-label="Project assistant"
        aria-hidden={!open}
        className={cx(
          "fixed top-16 right-3 z-50 w-[min(100vw-1.5rem,400px)] flex-col overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface-solid)] shadow-[var(--shadow-modal)]",
          "h-[min(calc(100vh-5.5rem),640px)]",
          open ? "flex" : "hidden",
        )}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent-2)]">
            <CopilotMark size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none text-[var(--text)]">
              Copilot
            </p>
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-subtle)]">
              Ask about this board · Ctrl+J
            </p>
          </div>
          <Link
            href={assistantHref}
            title="Open full page"
            className="rounded-[var(--radius-sm)] px-1.5 py-1 text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
          >
            <ExpandIcon />
          </Link>
          <button
            type="button"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
            className="rounded-[var(--radius-sm)] px-1.5 py-1 text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
          >
            <CloseIcon />
          </button>
        </header>
        <AiChatThread
          orgSlug={orgSlug}
          projectSlug={projectSlug}
          variant="popup"
        />
      </div>
    </>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8.75 2.75h4.5v4.5h-1.5V4.81L8.28 8.28l-1.06-1.06 3.47-3.47H8.75v-1.5ZM2.75 8.75v4.5h4.5v-1.5H4.81l3.47-3.47-1.06-1.06L3.75 10.69V8.75h-1.5Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}
