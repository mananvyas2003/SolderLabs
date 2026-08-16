import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unescapeKiCadNetName, stripOverbarSyntax } from "./connectivity.ts";

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
  if (/<export[\s>]/.test(src) || /<net\s/.test(src)) {
    const netRe = /<net\b([^>]*)>([\s\S]*?)<\/net>/gi;
    let nm: RegExpExecArray | null;
    while ((nm = netRe.exec(src))) {
      const name =
        nm[1]!.match(/\bname="([^"]*)"/)?.[1] ??
        nm[1]!.match(/\bname='([^']*)'/)?.[1];
      if (!name) continue;
      const nodes: string[] = [];
      for (const node of nm[2]!.matchAll(/<node\b([^>]*)\/?>/gi)) {
        const ref = node[1]!.match(/\bref="([^"]*)"/)?.[1];
        const pin = node[1]!.match(/\bpin="([^"]*)"/)?.[1];
        if (ref && pin) nodes.push(`${ref}.${pin}`);
      }
      map.set(name, [...new Set(nodes)].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ));
    }
    if (map.size) return map;
  }
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
  const abs = path.resolve(schematicPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`schematic not found: ${abs}`);
  }
  const cwd = path.dirname(abs);
  const out = path.join(
    os.tmpdir(),
    `solderlab-netlist-${process.pid}-${Date.now()}.net`,
  );
  const attempts: Array<{ args: string[]; cwd?: string }> = [
    { args: ["sch", "export", "netlist", "-o", out, path.basename(abs)], cwd },
    { args: ["sch", "export", "netlist", "--output", out, path.basename(abs)], cwd },
    { args: ["sch", "export", "netlist", "-o", out, abs], cwd },
    { args: ["sch", "export", "netlist", "-o", out, abs] },
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    const res = spawnSync(cli, attempt.args, {
      encoding: "utf8",
      timeout: 180_000,
      cwd: attempt.cwd,
      env: { ...process.env, LC_ALL: "C" },
    });
    if (res.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) {
      const text = fs.readFileSync(out, "utf8");
      try {
        fs.unlinkSync(out);
      } catch {
        /* ignore */
      }
      return text;
    }
    errors.push(
      (res.stderr || res.stdout || `exit ${res.status}`).trim().slice(0, 400),
    );
  }
  throw new Error(`kicad-cli netlist failed: ${errors.filter(Boolean).join(" | ")}`);
}

function canonicalNetName(name: string): string {
  return stripOverbarSyntax(unescapeKiCadNetName(name)).replace(/^\/+/, "").trim();
}

function pinKey(nodes: string[], ignorePowerFlagPins: boolean): string {
  const filtered = ignorePowerFlagPins
    ? nodes.filter((n) => !n.startsWith("#"))
    : nodes;
  return [...new Set(filtered)]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .join("\n");
}

function mergeByCanonicalName(
  nets: Map<string, string[]>,
): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  for (const [name, nodes] of nets) {
    const key = canonicalNetName(name);
    const prev = merged.get(key) ?? [];
    merged.set(key, [...new Set([...prev, ...nodes])]);
  }
  return merged;
}

/** Pin-set identity. Hierarchical `/GND` vs `GND` with the same nodes is a match. */
export function pinsetMismatches(
  ours: Map<string, string[]>,
  oracle: Map<string, string[]>,
  opts?: { ignorePowerFlagPins?: boolean },
): string[] {
  const ignorePower = opts?.ignorePowerFlagPins === true;
  const a = mergeByCanonicalName(ours);
  const b = mergeByCanonicalName(oracle);
  const byPinsOurs = new Map<string, string[]>();
  const byPinsOracle = new Map<string, string[]>();
  for (const [name, nodes] of a) {
    const k = pinKey(nodes, ignorePower);
    if (!k) continue;
    const list = byPinsOurs.get(k) ?? [];
    list.push(name);
    byPinsOurs.set(k, list);
  }
  for (const [name, nodes] of b) {
    const k = pinKey(nodes, ignorePower);
    if (!k) continue;
    const list = byPinsOracle.get(k) ?? [];
    list.push(name);
    byPinsOracle.set(k, list);
  }
  const keys = new Set([...byPinsOurs.keys(), ...byPinsOracle.keys()]);
  const out: string[] = [];
  for (const k of keys) {
    if (byPinsOurs.has(k) && byPinsOracle.has(k)) continue;
    const oursNames = (byPinsOurs.get(k) ?? []).join("|") || "—";
    const oracleNames = (byPinsOracle.get(k) ?? []).join("|") || "—";
    const preview = k.split("\n").slice(0, 6).join(",");
    out.push(`${oursNames} vs ${oracleNames} [${preview}]`);
  }
  return out;
}

/** Membership equality for nets that exist (by canonical name) on both sides. */
export function sharedNetMembershipMismatches(
  ours: Map<string, string[]>,
  oracle: Map<string, string[]>,
  opts?: { ignorePowerFlagPins?: boolean },
): string[] {
  const ignorePower = opts?.ignorePowerFlagPins === true;
  const a = mergeByCanonicalName(ours);
  const b = mergeByCanonicalName(oracle);
  const out: string[] = [];
  for (const name of a.keys()) {
    if (!b.has(name)) continue;
    const ka = pinKey(a.get(name)!, ignorePower);
    const kb = pinKey(b.get(name)!, ignorePower);
    if (ka !== kb) {
      out.push(
        `${name}: ours ${ka.split("\n").filter(Boolean).length} pins vs oracle ${kb.split("\n").filter(Boolean).length}`,
      );
    }
  }
  const gndO = pinKey(b.get("GND") ?? [], ignorePower);
  const gndA = pinKey(a.get("GND") ?? [], ignorePower);
  if (gndO.split("\n").filter(Boolean).length >= 5 && gndA !== gndO && !out.some((s) => s.startsWith("GND:"))) {
    out.push(
      `GND: ours ${gndA.split("\n").filter(Boolean).length} pins vs oracle ${gndO.split("\n").filter(Boolean).length}`,
    );
  }
  return out;
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
    if (fs.existsSync(resolved)) {
      try {
        const sibling = fs
          .readdirSync(path.dirname(resolved))
          .find((n) => n.endsWith(".kicad_sch"));
        if (sibling) return path.join(path.dirname(resolved), sibling);
      } catch {
        /* ignore */
      }
    }
  }
  return fs.existsSync(resolved) ? resolved : null;
}
