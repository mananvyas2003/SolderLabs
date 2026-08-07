import fs from "node:fs";
import path from "node:path";

export interface LibTableEntry {
  name: string;
  type: string;
  uri: string;
  options: string;
  descr: string;
}

export interface LibResolution {
  nickname: string;
  status: "ok" | "unresolved" | "embedded";
  resolvedPath?: string;
}

/**
 * Parse a KiCad `sym-lib-table` / `fp-lib-table` file.
 * Missing files → empty list (graceful degrade).
 */
export function parseLibTableFile(filePath: string): LibTableEntry[] {
  if (!fs.existsSync(filePath)) return [];
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const entries: LibTableEntry[] = [];
  const re =
    /\(lib\s+\(name\s+"?([^"\s)]+)"?\)\s*\(type\s+"?([^"\s)]+)"?\)\s*\(uri\s+"?([^"\s)]+)"?\)\s*\(options\s+"?([^"]*)"?\)\s*\(descr\s+"?([^"]*)"?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    entries.push({
      name: m[1]!,
      type: m[2]!,
      uri: m[3]!,
      options: m[4] ?? "",
      descr: m[5] ?? "",
    });
  }
  // Looser fallback for multiline entries
  if (!entries.length) {
    for (const lib of text.matchAll(/\(lib\b[\s\S]*?\n\s*\)/g)) {
      const block = lib[0];
      const name = block.match(/\(name\s+"?([^"\s)]+)"?\)/)?.[1];
      const type = block.match(/\(type\s+"?([^"\s)]+)"?\)/)?.[1] ?? "";
      const uri = block.match(/\(uri\s+"([^"]+)"\)|\(uri\s+([^\s)]+)\)/)?.[1]
        ?? block.match(/\(uri\s+"?([^"\s)]+)"?\)/)?.[1];
      if (name && uri) {
        entries.push({
          name,
          type,
          uri,
          options: block.match(/\(options\s+"([^"]*)"\)/)?.[1] ?? "",
          descr: block.match(/\(descr\s+"([^"]*)"\)/)?.[1] ?? "",
        });
      }
    }
  }
  return entries;
}

export function loadProjectLibTables(projectDir: string): {
  symbol: LibTableEntry[];
  footprint: LibTableEntry[];
} {
  return {
    symbol: [
      ...parseLibTableFile(path.join(projectDir, "sym-lib-table")),
      ...parseLibTableFile(path.join(projectDir, "..", "sym-lib-table")),
    ],
    footprint: [
      ...parseLibTableFile(path.join(projectDir, "fp-lib-table")),
      ...parseLibTableFile(path.join(projectDir, "..", "fp-lib-table")),
    ],
  };
}

function expandUri(uri: string, projectDir: string): string {
  return uri
    .replace(/\$\{KIPRJMOD\}/gi, projectDir)
    .replace(/\$\{KICAD\d*_SYMBOL_DIR\}/gi, "")
    .replace(/\$\{KICAD\d*_FOOTPRINT_DIR\}/gi, "");
}

/**
 * Resolve `LibNickname:Symbol` against project tables.
 * Embedded lib_symbols always count as ok (caller passes embeddedNicknames).
 * Missing on-disk paths → unresolved — never throws / never drops components.
 */
export function resolveLibId(
  libId: string | undefined,
  tables: LibTableEntry[],
  projectDir: string,
  embeddedNicknames: Set<string>,
): LibResolution {
  if (!libId) {
    return { nickname: "", status: "unresolved" };
  }
  const nickname = libId.split(":")[0] ?? libId;
  if (embeddedNicknames.has(nickname) || embeddedNicknames.has(libId)) {
    return { nickname, status: "embedded" };
  }
  const entry = tables.find((t) => t.name === nickname);
  if (!entry) {
    // Global KiCad libs are usually unavailable server-side — still record component
    return { nickname, status: "unresolved" };
  }
  const expanded = expandUri(entry.uri, projectDir);
  if (!expanded || expanded.includes("${")) {
    return { nickname, status: "unresolved" };
  }
  const candidate = path.isAbsolute(expanded)
    ? expanded
    : path.resolve(projectDir, expanded);
  if (fs.existsSync(candidate)) {
    return { nickname, status: "ok", resolvedPath: candidate };
  }
  return { nickname, status: "unresolved" };
}
