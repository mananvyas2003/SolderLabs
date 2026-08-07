export { emitC } from "./c";
export { emitZephyr } from "./zephyr";
export { emitKconfig } from "./kconfig";
export { emitRust } from "./rust";
export { emitJson } from "./json";
export {
  emitHeaderComment,
  cBlockComment,
  hashComment,
  rustDocComment,
  toIdent,
} from "./common";

import type { BoardSupportContract } from "../types";
import { emitC } from "./c";
import { emitZephyr } from "./zephyr";
import { emitKconfig } from "./kconfig";
import { emitRust } from "./rust";
import { emitJson } from "./json";

export type EmitFormat = "c" | "zephyr" | "kconfig" | "rust" | "json";

export const EMIT_FORMATS: EmitFormat[] = [
  "c",
  "zephyr",
  "kconfig",
  "rust",
  "json",
];

export function emitBSC(
  bsc: BoardSupportContract,
  format: EmitFormat,
): string {
  switch (format) {
    case "c":
      return emitC(bsc);
    case "zephyr":
      return emitZephyr(bsc);
    case "kconfig":
      return emitKconfig(bsc);
    case "rust":
      return emitRust(bsc);
    case "json":
      return emitJson(bsc);
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown emit format: ${_exhaustive}`);
    }
  }
}

export function emitExtension(format: EmitFormat): string {
  switch (format) {
    case "c":
      return "h";
    case "zephyr":
      return "overlay";
    case "kconfig":
      return "Kconfig";
    case "rust":
      return "rs";
    case "json":
      return "json";
  }
}
