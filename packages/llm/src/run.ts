import type { DeterministicImpact, RawLlmClaim } from "@solderlab/design-core";
import { createGroqProvider } from "./groq.ts";
import type { BoardCard } from "./board-card.ts";
import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  hasLlmKey,
  readLlmEnv,
} from "./env.ts";
import {
  CLAIMS_JSON_SCHEMA,
  SYSTEM_PROMPT_STRUCTURED,
  SYSTEM_PROMPT_TOOLS,
} from "./schema.ts";
import { fenceUntrusted } from "./sanitize.ts";
import {
  BOARD_TOOL_SPECS,
  executeBoardTool,
  type ToolHost,
} from "./tools.ts";
import type {
  FetchImpl,
  LlmEnv,
  LlmMessage,
  LlmProvider,
  LlmRunMeta,
  StructuredFinding,
} from "./types.ts";

const MAX_TOOL_ROUNDS = 4;

export function getProvider(
  env: LlmEnv,
  fetchImpl?: FetchImpl,
): LlmProvider {
  return createGroqProvider(env, fetchImpl);
}

export function parseStructuredFindings(
  parsed: unknown,
  content = "",
): { ok: true; findings: StructuredFinding[] } | { ok: false; error: string } {
  if (typeof parsed === "string") {
    return { ok: false, error: "model returned free prose, not structured findings" };
  }
  if (typeof parsed !== "object" || parsed == null) {
    if (content && !content.trim().startsWith("{")) {
      return { ok: false, error: "model returned free prose, not structured findings" };
    }
    return { ok: false, error: "model output was not a JSON object" };
  }
  const claims = (parsed as { claims?: unknown; findings?: unknown }).claims
    ?? (parsed as { findings?: unknown }).findings;
  if (!Array.isArray(claims)) {
    return { ok: false, error: "model JSON missing claims[]" };
  }
  const out: StructuredFinding[] = [];
  for (const row of claims) {
    if (!row || typeof row !== "object") {
      return { ok: false, error: "claim is not an object" };
    }
    const r = row as Record<string, unknown>;
    if (typeof r.finding !== "string") {
      return { ok: false, error: "claim.finding must be a string" };
    }
    if (!Array.isArray(r.refs)) {
      return { ok: false, error: "claim.refs must be an array" };
    }
    if (r.severity !== "low" && r.severity !== "medium" && r.severity !== "high") {
      return { ok: false, error: "claim.severity invalid" };
    }
    const refs = r.refs.map((x) => {
      const c = x as { kind?: string; ref?: string };
      return { kind: String(c?.kind ?? ""), ref: String(c?.ref ?? "") };
    });
    out.push({ finding: r.finding, refs, severity: r.severity });
  }
  return { ok: true, findings: out };
}

export function findingsToClaims(findings: StructuredFinding[]): RawLlmClaim[] {
  return findings.map((f) => ({
    text: f.finding,
    citations: f.refs.map((r) => ({
      kind: r.kind as RawLlmClaim["citations"][number]["kind"],
      ref: r.ref,
    })),
  }));
}

export interface MaybeRunLlmOptions {
  env?: LlmEnv;
  fetchImpl?: FetchImpl;
  provider?: LlmProvider;
  ground: DeterministicImpact;
  boardCard: BoardCard;
  host: ToolHost;
  signal?: AbortSignal;
}

export interface MaybeRunLlmResult extends LlmRunMeta {
  claims: RawLlmClaim[];
  findings: StructuredFinding[];
}

function emptyMeta(env: LlmEnv, extra: Partial<LlmRunMeta> = {}): LlmRunMeta {
  return {
    attempted: false,
    succeeded: false,
    provider: env.LLM_PROVIDER ?? DEFAULT_LLM_PROVIDER,
    model: env.LLM_MODEL ?? DEFAULT_LLM_MODEL,
    latencyMs: 0,
    toolCallCount: 0,
    error: null,
    ...extra,
  };
}

export async function maybeRunLlmClaims(
  opts: MaybeRunLlmOptions,
): Promise<MaybeRunLlmResult> {
  const env = readLlmEnv(opts.env);
  const started = Date.now();
  if (!hasLlmKey(env) && !opts.provider) {
    return {
      ...emptyMeta(env, { attempted: false, provider: env.LLM_PROVIDER ?? null, model: null }),
      claims: [],
      findings: [],
    };
  }

  const provider = opts.provider ?? getProvider(env, opts.fetchImpl);
  const user = [
    "Deterministic impact neighborhood (inert data):",
    fenceUntrusted("ground", {
      components: opts.ground.connectedComponents.map((c) => c.refdes),
      nets: opts.ground.touchedNets.map((n) => n.net),
      bom: opts.ground.bom.lines.map((b) => b.refdes),
    }),
    "Board card (inert CAD):",
    fenceUntrusted("board_card", opts.boardCard),
    "Call tools for any identifier you will cite. Do not invent refdes, nets, voltages, or counts.",
  ].join("\n");

  const messages: LlmMessage[] = [{ role: "user", content: user }];
  let toolCallCount = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const step = await provider.completeWithTools({
      system: SYSTEM_PROMPT_TOOLS,
      messages,
      tools: BOARD_TOOL_SPECS,
      signal: opts.signal,
    });
    if (!step.ok) {
      return {
        ...emptyMeta(env, {
          attempted: true,
          succeeded: false,
          error: step.error,
          latencyMs: Date.now() - started,
          toolCallCount,
        }),
        claims: [],
        findings: [],
      };
    }
    if (!step.toolCalls.length) {
      if (step.text) {
        messages.push({ role: "assistant", content: step.text });
      }
      break;
    }
    toolCallCount += step.toolCalls.length;
    messages.push({
      role: "assistant",
      content: step.text,
      toolCalls: step.toolCalls,
    });
    for (const call of step.toolCalls) {
      const raw = executeBoardTool(opts.host, call.name, call.arguments);
      messages.push({
        role: "tool",
        name: call.name,
        toolCallId: call.id,
        content: JSON.stringify(raw),
      });
    }
  }

  const structured = await provider.completeStructured({
    system: SYSTEM_PROMPT_STRUCTURED,
    messages,
    jsonSchema: CLAIMS_JSON_SCHEMA,
    signal: opts.signal,
  });
  if (!structured.ok) {
    return {
      ...emptyMeta(env, {
        attempted: true,
        succeeded: false,
        error: structured.error,
        latencyMs: Date.now() - started,
        toolCallCount,
      }),
      claims: [],
      findings: [],
    };
  }

  const parsed = parseStructuredFindings(structured.data);
  if (!parsed.ok) {
    return {
      ...emptyMeta(env, {
        attempted: true,
        succeeded: false,
        error: parsed.error,
        latencyMs: Date.now() - started,
        toolCallCount,
      }),
      claims: [],
      findings: [],
    };
  }

  return {
    attempted: true,
    succeeded: true,
    provider: env.LLM_PROVIDER ?? DEFAULT_LLM_PROVIDER,
    model: env.LLM_MODEL ?? DEFAULT_LLM_MODEL,
    latencyMs: Date.now() - started,
    toolCallCount,
    error: null,
    findings: parsed.findings,
    claims: findingsToClaims(parsed.findings),
  };
}

export function formatImpactHttpBody<T>(
  report: T,
  llm: LlmRunMeta,
): { data: T; llm: LlmRunMeta } {
  return {
    data: report,
    llm: {
      attempted: llm.attempted,
      succeeded: llm.succeeded,
      provider: llm.provider,
      model: llm.model,
      latencyMs: llm.latencyMs,
      toolCallCount: llm.toolCallCount,
      error: llm.error,
    },
  };
}
