import type { LlmEnv } from "./types.ts";

export const DEFAULT_LLM_PROVIDER = "groq";
export const DEFAULT_LLM_BASE_URL = "https://api.groq.com/openai/v1";
export const DEFAULT_LLM_MODEL = "openai/gpt-oss-120b";

export function readLlmEnv(override?: LlmEnv): LlmEnv {
  return {
    LLM_PROVIDER:
      override?.LLM_PROVIDER ??
      process.env.LLM_PROVIDER ??
      DEFAULT_LLM_PROVIDER,
    LLM_API_KEY: override?.LLM_API_KEY ?? process.env.LLM_API_KEY ?? "",
    LLM_BASE_URL:
      override?.LLM_BASE_URL ??
      process.env.LLM_BASE_URL ??
      DEFAULT_LLM_BASE_URL,
    LLM_MODEL:
      override?.LLM_MODEL ?? process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL,
  };
}

export function hasLlmKey(env: LlmEnv): boolean {
  return Boolean(env.LLM_API_KEY?.trim());
}
