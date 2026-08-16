import { test } from "node:test";
import assert from "node:assert/strict";
import { createGroqProvider } from "../groq.ts";
import { CLAIMS_JSON_SCHEMA } from "../schema.ts";
import { parseStructuredFindings } from "../run.ts";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from "../env.ts";

test("T7: Groq strict:true schema round-trip returns parseable claims JSON", async (t) => {
  const key = process.env.LLM_API_KEY?.trim();
  if (!key) {
    t.skip("LLM_API_KEY not set — cannot hit real Groq (no key in repo)");
    return;
  }

  const provider = createGroqProvider({
    LLM_PROVIDER: "groq",
    LLM_API_KEY: key,
    LLM_BASE_URL: process.env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL,
    LLM_MODEL: process.env.LLM_MODEL || DEFAULT_LLM_MODEL,
  });

  const result = await provider.completeStructured({
    system:
      "Return JSON matching the schema. Do not invent identifiers. Empty claims is allowed.",
    messages: [
      {
        role: "user",
        content:
          "Produce {\"claims\":[]} with no other keys. This is a schema round-trip.",
      },
    ],
    jsonSchema: CLAIMS_JSON_SCHEMA,
  });

  console.log("T7 groq ok", result.ok);
  if (!result.ok) {
    console.log("T7 error", result.error);
  } else {
    console.log("T7 data", JSON.stringify(result.data));
  }

  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) return;
  const parsed = parseStructuredFindings(result.data);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) return;
  assert.ok(Array.isArray(parsed.findings));
  for (const c of parsed.findings) {
    assert.equal(typeof c.finding, "string");
    assert.ok(Array.isArray(c.refs));
    assert.ok(["low", "medium", "high"].includes(c.severity));
  }
});
