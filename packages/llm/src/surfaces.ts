import {
  classifyProposal,
  isWithheld,
  type ClassifiedProposal,
} from "@solderlab/design-core";
import type { LlmMessage } from "./types.ts";

function parseJson(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}

/** Pull simulate_change engine verdicts out of the tool loop. Model class is ignored. */
export function proposalsFromToolMessages(
  messages: LlmMessage[],
): ClassifiedProposal[] {
  const out: ClassifiedProposal[] = [];
  for (const m of messages) {
    if (m.role !== "tool" || m.name !== "simulate_change") continue;
    const parsed = parseJson(m.content);
    const classified = classifyProposal(parsed);
    if (isWithheld(classified)) continue;
    out.push(classified);
  }
  return out;
}
