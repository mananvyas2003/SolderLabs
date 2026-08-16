import type {
  CompleteStructuredInput,
  CompleteWithToolsInput,
  LlmProvider,
  ProviderErr,
} from "./types.ts";

const unsupported: ProviderErr = {
  ok: false,
  error:
    "LLM_PROVIDER=anthropic is not used for Impact. Set LLM_PROVIDER=groq.",
};

export function createAnthropicProvider(): LlmProvider {
  return {
    async completeWithTools(_o: CompleteWithToolsInput) {
      return unsupported;
    },
    async completeStructured(_o: CompleteStructuredInput) {
      return unsupported;
    },
  };
}
