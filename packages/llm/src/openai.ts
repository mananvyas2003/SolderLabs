import { createGroqProvider } from "./groq.ts";
import type { FetchImpl, LlmEnv, LlmProvider } from "./types.ts";

/** OpenAI-compatible path — same SDK as Groq, different default base URL. */
export function createOpenAIProvider(
  env: LlmEnv,
  fetchImpl?: FetchImpl,
): LlmProvider {
  return createGroqProvider(
    {
      ...env,
      LLM_BASE_URL: env.LLM_BASE_URL || "https://api.openai.com/v1",
      LLM_MODEL: env.LLM_MODEL || "gpt-4o-mini",
    },
    fetchImpl,
  );
}
