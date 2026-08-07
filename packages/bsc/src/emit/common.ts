import type { BoardSupportContract } from "../types";

/** Shared banner for every firmware emitter. Pure. */
export function emitHeaderComment(bsc: BoardSupportContract, format: string): string {
  const lines = [
    `generated-by: @solderlab/bsc (${format})`,
    `board: ${bsc.boardName}`,
    `source-revision: ${bsc.generatedFrom.revisionId ?? "null"}`,
    `bsc-schema-version: ${bsc.schemaVersion}`,
    `source-sha256: ${bsc.generatedFrom.sha256}`,
    `DO NOT EDIT`,
  ];
  return lines.map((l) => ` * ${l}`).join("\n");
}

export function cBlockComment(bsc: BoardSupportContract, format: string): string {
  return `/*\n${emitHeaderComment(bsc, format)}\n */`;
}

export function hashComment(bsc: BoardSupportContract, format: string): string {
  return emitHeaderComment(bsc, format)
    .split("\n")
    .map((l) => `#${l}`)
    .join("\n");
}

export function rustDocComment(bsc: BoardSupportContract, format: string): string {
  return emitHeaderComment(bsc, format)
    .split("\n")
    .map((l) => `//${l}`)
    .join("\n");
}

/** Sanitize a net/pin label into a C/Rust identifier. */
export function toIdent(raw: string, fallback: string): string {
  let s = raw
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) s = fallback;
  else if (/^[0-9]/.test(s)) s = `N${s}`;
  return s.toUpperCase();
}

export function isNamedSignal(net: string | null | undefined): boolean {
  if (!net) return false;
  return !/^N\$|^Net-\(/i.test(net);
}
