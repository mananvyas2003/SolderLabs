import type { BoardSupportContract } from "../types";
import { rustDocComment } from "./common";

/** Raw BSC JSON with the standard header comment prepended. */
export function emitJson(bsc: BoardSupportContract): string {
  return `${rustDocComment(bsc, "json")}\n${JSON.stringify(bsc, null, 2)}\n`;
}
