import type { ClassifiedProposal } from "@solderlab/design-core";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  proposals?: ClassifiedProposal[];
};

export type ChatResponse = {
  ok: boolean;
  reply: string;
  error?: string;
  revisionId?: string | null;
  class?: "advisory";
  banner?: string | null;
  canGateMerge?: boolean;
  proposals?: ClassifiedProposal[];
  llm?: {
    attempted: boolean;
    succeeded: boolean;
    provider: string | null;
    model: string | null;
    latencyMs: number;
    toolCallCount: number;
    error: string | null;
  };
};

export async function sendProjectChat(opts: {
  orgSlug: string;
  projectSlug: string;
  message: string;
  messages: ChatTurn[];
  revisionId?: string | null;
  signal?: AbortSignal;
}): Promise<ChatResponse> {
  const res = await fetch(
    `/api/orgs/${opts.orgSlug}/projects/${opts.projectSlug}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: opts.message,
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        revisionId: opts.revisionId ?? undefined,
      }),
      signal: opts.signal,
    },
  );
  const json = (await res.json().catch(() => null)) as ChatResponse | null;
  if (!json) {
    throw new Error(res.ok ? "Empty assistant response" : `Assistant failed (${res.status})`);
  }
  if (!res.ok || !json.ok) {
    throw new Error(json.error || json.llm?.error || `Assistant failed (${res.status})`);
  }
  return json;
}
