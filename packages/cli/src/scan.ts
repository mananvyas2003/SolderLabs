import fs from "node:fs";
import path from "node:path";

export interface CallSite {
  file: string;
  line: number;
  text: string;
  symbol: string;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
  ".pio",
  "zephyr",
  "out",
]);

const CODE_EXT = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".rs",
  ".overlay",
  ".dts",
  ".dtsi",
  ".S",
  ".s",
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(p, out);
    } else if (CODE_EXT.has(path.extname(ent.name))) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Grep firmware sources for exact symbol tokens (word-boundary-ish).
 */
export function scanCallSites(
  srcDir: string,
  symbols: string[],
): CallSite[] {
  const uniq = [...new Set(symbols.filter((s) => s.length >= 2))];
  if (!uniq.length) return [];
  const files = walk(path.resolve(srcDir));
  const hits: CallSite[] = [];

  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const sym of uniq) {
        // Avoid matching tiny substrings inside longer tokens unless delimited
        const re = new RegExp(
          `(^|[^A-Za-z0-9_])${escapeRegExp(sym)}([^A-Za-z0-9_]|$)`,
        );
        if (re.test(line)) {
          hits.push({
            file,
            line: i + 1,
            text: line.trim(),
            symbol: sym,
          });
        }
      }
    }
  }
  return hits.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.symbol.localeCompare(b.symbol),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
