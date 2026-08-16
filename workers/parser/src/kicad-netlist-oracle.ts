import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function extractBlocks(src: string, tag: string): string[] {
  const needle = `(${tag}`;
  const blocks: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf(needle, i);
    if (start < 0) break;
    const after = src[start + needle.length];
    if (after && after !== " " && after !== "\n" && after !== "\r" && after !== "\t") {
      i = start + 1;
      continue;
    }
    let depth = 0;
    let j = start;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    blocks.push(src.slice(start, j));
    i = j;
  }
  return blocks;
}

/** Map net name → sorted `refdes.pin` membership. */
export function parseKicadExportNetlist(src: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const netsSec = extractBlocks(src, "nets")[0] ?? src;
  for (const block of extractBlocks(netsSec, "net")) {
    const name = block.match(/\(name\s+"([^"]*)"\)/)?.[1];
    if (!name) continue;
    const nodes: string[] = [];
    for (const m of block.matchAll(/\(node\s+\(ref\s+"([^"]+)"\)\s+\(pin\s+"([^"]+)"\)/g)) {
      nodes.push(`${m[1]}.${m[2]}`);
    }
    map.set(name, [...new Set(nodes)].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ));
  }
  return map;
}

export function findKicadCli(): string | null {
  const fromEnv = process.env.KICAD_CLI?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["kicad-cli"], {
    encoding: "utf8",
  });
  const hit = (which.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return hit || null;
}

export function exportNetlistWithKicadCli(schematicPath: string): string {
  const cli = findKicadCli();
  if (!cli) {
    throw new Error("kicad-cli not found — install KiCad or set KICAD_CLI");
  }
  const out = path.join(
    os.tmpdir(),
    `solderlab-netlist-${process.pid}-${Date.now()}.net`,
  );
  const res = spawnSync(cli, ["sch", "export", "netlist", "-o", out, schematicPath], {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (res.status !== 0) {
    throw new Error(
      `kicad-cli netlist failed: ${res.stderr || res.stdout || `exit ${res.status}`}`,
    );
  }
  const text = fs.readFileSync(out, "utf8");
  try {
    fs.unlinkSync(out);
  } catch {
    /* ignore */
  }
  return text;
}

export function schematicPathFromProjectRoot(
  absDir: string,
  projectRoot: string | undefined,
): string | null {
  if (!projectRoot) return null;
  const first = projectRoot.split(",")[0]!;
  const resolved = path.resolve(absDir, first);
  if (resolved.endsWith(".kicad_sch") && fs.existsSync(resolved)) return resolved;
  if (resolved.endsWith(".kicad_pro")) {
    const sch = resolved.replace(/\.kicad_pro$/i, ".kicad_sch");
    if (fs.existsSync(sch)) return sch;
  }
  return fs.existsSync(resolved) ? resolved : null;
}
