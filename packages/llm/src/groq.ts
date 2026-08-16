import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
} from "./env.ts";
import type {
  CompleteStructuredInput,
  CompleteTextInput,
  CompleteWithToolsInput,
  FetchImpl,
  LlmEnv,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
  LlmUsage,
  ProviderErr,
} from "./types.ts";

const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const MAX_TOKENS = 1024;

function emptyUsage(): LlmUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function usageFrom(u: OpenAI.Completions.CompletionUsage | null | undefined): LlmUsage {
  return {
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    totalTokens: u?.total_tokens ?? 0,
  };
}

function fail(error: unknown): ProviderErr {
  if (error && typeof error === "object" && "error" in error) {
    const e = error as { error: string };
    if (typeof e.error === "string") return { ok: false, error: e.error };
  }
  if (error instanceof OpenAI.APIError) {
    return { ok: false, error: `${error.status}: ${error.message}` };
  }
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: String(error) };
}

function toOpenAIMessages(
  system: string,
  messages: LlmMessage[],
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
  ];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId ?? "",
        content: m.content,
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: "function" as const,
          function: {
            name: t.name,
            arguments: JSON.stringify(t.arguments ?? {}),
          },
        })),
      });
      continue;
    }
    if (m.role === "system") {
      out.push({ role: "system", content: m.content });
      continue;
    }
    out.push({ role: "user", content: m.content });
  }
  return out;
}

function parseToolCalls(
  msg: OpenAI.Chat.Completions.ChatCompletionMessage,
): LlmToolCall[] {
  const calls: LlmToolCall[] = [];
  for (const tc of msg.tool_calls ?? []) {
    if (tc.type !== "function") continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
    } catch (e) {
      throw new Error(
        `Groq tool arguments were not JSON for ${tc.function.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    calls.push({ id: tc.id, name: tc.function.name, arguments: args });
  }
  return calls;
}

export function createGroqProvider(
  env: LlmEnv,
  fetchImpl?: FetchImpl,
): LlmProvider {
  const client = new OpenAI({
    apiKey: env.LLM_API_KEY,
    baseURL: (env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL).replace(/\/$/, ""),
    timeout: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  const model = env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;

  return {
    async completeWithTools(o: CompleteWithToolsInput) {
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            temperature: 0,
            max_tokens: MAX_TOKENS,
            messages: toOpenAIMessages(o.system, o.messages),
            tools: o.tools.map((t) => ({
              type: "function" as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
          },
          { signal: o.signal, timeout: TIMEOUT_MS },
        );
        const msg = completion.choices[0]?.message;
        if (!msg) {
          return { ok: false, error: "Groq tool call returned no message" };
        }
        return {
          ok: true as const,
          text: msg.content ?? "",
          toolCalls: parseToolCalls(msg),
          usage: usageFrom(completion.usage),
        };
      } catch (e) {
        return fail(e);
      }
    },

    async completeStructured(o: CompleteStructuredInput) {
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            temperature: 0,
            max_tokens: MAX_TOKENS,
            messages: toOpenAIMessages(o.system, o.messages),
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "solderlab_claims",
                strict: true,
                schema: o.jsonSchema,
              },
            },
          },
          { signal: o.signal, timeout: TIMEOUT_MS },
        );
        const content = completion.choices[0]?.message?.content;
        if (!content) {
          return { ok: false, error: "Groq structured call returned empty content" };
        }
        let data: unknown;
        try {
          data = JSON.parse(content);
        } catch {
          return {
            ok: false,
            error: `Groq structured output was not JSON: ${content.slice(0, 200)}`,
          };
        }
        return {
          ok: true as const,
          data,
          usage: usageFrom(completion.usage),
        };
      } catch (e) {
        return fail(e);
      }
    },

    async completeText(o: CompleteTextInput) {
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            temperature: 0.2,
            max_tokens: 2048,
            messages: toOpenAIMessages(o.system, o.messages),
          },
          { signal: o.signal, timeout: TIMEOUT_MS },
        );
        const text = completion.choices[0]?.message?.content ?? "";
        if (!text.trim()) {
          return { ok: false, error: "Groq returned an empty reply" };
        }
        return {
          ok: true as const,
          text,
          usage: usageFrom(completion.usage),
        };
      } catch (e) {
        return fail(e);
      }
    },
  };
}
