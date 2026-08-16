export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmMessage {
  role: LlmRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
}

export interface LlmToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type ProviderOk<T> = T & { ok: true };
export type ProviderErr = { ok: false; error: string };

export interface CompleteWithToolsInput {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolSpec[];
  signal?: AbortSignal;
}

export interface CompleteStructuredInput {
  system: string;
  messages: LlmMessage[];
  jsonSchema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface CompleteTextInput {
  system: string;
  messages: LlmMessage[];
  signal?: AbortSignal;
}

export interface LlmProvider {
  completeWithTools(
    o: CompleteWithToolsInput,
  ): Promise<
    | ProviderOk<{ toolCalls: LlmToolCall[]; text: string; usage: LlmUsage }>
    | ProviderErr
  >;
  completeStructured(
    o: CompleteStructuredInput,
  ): Promise<ProviderOk<{ data: unknown; usage: LlmUsage }> | ProviderErr>;
  completeText(
    o: CompleteTextInput,
  ): Promise<ProviderOk<{ text: string; usage: LlmUsage }> | ProviderErr>;
}

export interface LlmEnv {
  LLM_PROVIDER?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}

export type FindingSeverity = "low" | "medium" | "high";

export interface StructuredFinding {
  finding: string;
  refs: Array<{ kind: string; ref: string }>;
  severity: FindingSeverity;
}

export interface LlmRunMeta {
  attempted: boolean;
  succeeded: boolean;
  provider: string | null;
  model: string | null;
  latencyMs: number;
  toolCallCount: number;
  error: string | null;
}

export type FetchImpl = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
