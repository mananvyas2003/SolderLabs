"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import type { CopilotFinding } from "@solderlab/design-core";
import { Badge, Button, Input, cx } from "@solderlab/ui";
import { runCopilot } from "@/lib/copilot-client";

const COMMANDS = [
  { cmd: "/summarize", label: "Summarize" },
  { cmd: "/risks", label: "Risks" },
  { cmd: "/bom", label: "BOM" },
  { cmd: "/checklist", label: "Checklist" },
] as const;

function severityTone(
  s: CopilotFinding["severity"],
): "danger" | "warn" | "info" | "accent" {
  if (s === "critical" || s === "high") return "danger";
  if (s === "medium") return "warn";
  if (s === "info") return "info";
  return "accent";
}

export function ReviewRail({
  orgSlug,
  projectSlug,
  baseRevisionId,
  headRevisionId,
  orgId,
}: {
  orgSlug: string;
  projectSlug: string;
  baseRevisionId: string | null;
  headRevisionId: string | null;
  orgId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [findings, setFindings] = useState<CopilotFinding[]>([]);
  const [input, setInput] = useState("/risks");
  const [activeCmd, setActiveCmd] = useState("/risks");
  const [, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const autoRan = useRef<string | null>(null);

  const canRun = Boolean(baseRevisionId && headRevisionId);

  const run = useCallback(
    async (cmd: string) => {
      if (!baseRevisionId || !headRevisionId) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(true);
      setError(null);
      setActiveCmd(cmd);
      try {
        const result = await runCopilot({
          orgSlug,
          projectSlug,
          baseRevisionId,
          headRevisionId,
          command: cmd.split(/\s+/)[0] ?? cmd,
          message: cmd,
          signal: ac.signal,
        });
        // Defer paint so tab navigations stay responsive.
        startTransition(() => {
          setMarkdown(result.markdown);
          setFindings(result.findings);
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message || "Review failed");
      } finally {
        setBusy(false);
      }
    },
    [baseRevisionId, headRevisionId, orgSlug, projectSlug, startTransition],
  );

  useEffect(() => {
    if (!canRun || !baseRevisionId || !headRevisionId) return;
    const key = `${baseRevisionId}..${headRevisionId}`;
    if (autoRan.current === key) return;
    autoRan.current = key;
    // Idle so first paint + tab clicks are not competing with AI.
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 400));
    const id = ric(() => {
      void run("/risks");
    });
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(id as number);
      } else {
        clearTimeout(id as number);
      }
    };
  }, [canRun, baseRevisionId, headRevisionId, run]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function findingAction(
    finding: CopilotFinding,
    action: "dismissed" | "converted" | "ignored",
  ) {
    try {
      await fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "ai_finding_action",
          orgId: orgId ?? null,
          props: { findingId: finding.id, action },
        }),
        keepalive: true,
      });
    } catch {
      /* ignore */
    }
    if (action === "dismissed" || action === "ignored") {
      setFindings((prev) => prev.filter((f) => f.id !== finding.id));
    }
    if (action === "converted" && baseRevisionId && headRevisionId) {
      const href = `/app/${orgSlug}/${projectSlug}/compare?base=${baseRevisionId}&head=${headRevisionId}`;
      startTransition(() => {
        router.push(href);
      });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 rounded-[var(--radius)] bg-[var(--accent)] px-3.5 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-fg)] shadow-[var(--shadow-modal)] hover:bg-[var(--accent-hover)]"
      >
        Review · AI
      </button>
    );
  }

  return (
    <aside
      className={cx(
        "sticky top-14 z-10 flex h-[calc(100vh-3.5rem)] w-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface-inset)] lg:w-[320px]",
        pathname.includes("/compare") ? "hidden xl:flex" : "flex",
      )}
      aria-label="SolderLab Review"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <div>
          <div className="text-sm font-semibold">SolderLab Review</div>
          <p className="text-[11px] text-[var(--text-subtle)]">
            Rule-based review with evidence links
          </p>
          <p className="text-[11px] text-[var(--text-subtle)]">
            Local grounded assistant · Ctrl+`
          </p>
          <Link
            href={`/app/${orgSlug}/${projectSlug}/assistant`}
            className="text-[11px] text-[var(--accent-2)] hover:underline"
          >
            Groq chat
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          Hide
        </button>
      </div>

      {!canRun ? (
        <div className="space-y-2 p-4 text-sm text-[var(--text-muted)]">
          <p>
            Need at least two parsed revisions to suggest risks and next steps.
          </p>
          <p className="text-xs">
            Seed fixtures on Overview, or upload a second KiCad zip / .kicad_sch.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] px-3 py-2">
            {COMMANDS.map((c) => (
              <button
                key={c.cmd}
                type="button"
                disabled={busy}
                onClick={() => void run(c.cmd)}
                className={cx(
                  "rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium disabled:opacity-50",
                  activeCmd.startsWith(c.cmd)
                    ? "bg-[var(--accent-muted)] text-[var(--accent-2)]"
                    : "bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {busy && !markdown ? (
              <p className="text-sm text-[var(--text-muted)]">Analyzing diff…</p>
            ) : null}
            {error ? (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            ) : null}
            {markdown ? (
              <div className="whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-[13px] leading-relaxed text-[var(--text-soft)]">
                {markdown}
              </div>
            ) : null}

            {findings.length ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                  Suggested actions
                </p>
                {findings.map((f, i) => (
                  <article
                    key={`${f.id}-${i}`}
                    className="rounded-[var(--radius)] border border-[var(--border)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">{f.title}</h3>
                      <Badge tone={severityTone(f.severity)}>{f.severity}</Badge>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
                      {f.body}
                    </p>
                    {f.suggestedAction ? (
                      <p className="mt-2 text-xs font-medium text-[var(--accent)]">
                        → {f.suggestedAction}
                      </p>
                    ) : null}
                    {f.evidence?.length ? (
                      <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-[var(--text-subtle)]">
                        {f.evidence.slice(0, 4).map((e, i) => (
                          <li key={`${e.ref}-${i}`}>
                            {e.kind}:{e.ref}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className="!px-2 !py-0.5 text-xs"
                        onClick={() => void findingAction(f, "converted")}
                      >
                        Open in compare
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!px-2 !py-0.5 text-xs"
                        onClick={() => void findingAction(f, "dismissed")}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <form
            className="flex gap-2 border-t border-[var(--border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const cmd = input.trim() || "/summarize";
              void run(cmd);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="/explain C12"
              disabled={busy}
              className="font-mono text-xs"
            />
            <Button type="submit" disabled={busy}>
              {busy ? "…" : "Run"}
            </Button>
          </form>
        </>
      )}
    </aside>
  );
}
