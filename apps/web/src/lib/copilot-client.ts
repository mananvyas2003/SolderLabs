import type { CopilotFinding } from "@solderlab/design-core";

export type CopilotResult = {
  markdown: string;
  findings: CopilotFinding[];
};

/** Instant JSON path — preferred for local/mock and snappy UI. */
export async function runCopilot(opts: {
  orgSlug: string;
  projectSlug: string;
  baseRevisionId: string;
  headRevisionId: string;
  command: string;
  message?: string;
  signal?: AbortSignal;
}): Promise<CopilotResult> {
  const res = await fetch(
    `/api/orgs/${opts.orgSlug}/projects/${opts.projectSlug}/copilot`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevisionId: opts.baseRevisionId,
        headRevisionId: opts.headRevisionId,
        command: opts.command,
        message: opts.message ?? opts.command,
        stream: false,
      }),
      signal: opts.signal,
    },
  );
  if (!res.ok) {
    throw new Error((await res.text()) || "Copilot failed");
  }
  return (await res.json()) as CopilotResult;
}

/** @deprecated Prefer runCopilot — kept for streaming demos */
export async function streamCopilot(opts: {
  orgSlug: string;
  projectSlug: string;
  baseRevisionId: string;
  headRevisionId: string;
  command: string;
  message?: string;
  onMarkdown: (md: string) => void;
  onFindings: (findings: CopilotFinding[]) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const result = await runCopilot(opts);
  opts.onMarkdown(result.markdown);
  opts.onFindings(result.findings);
}
