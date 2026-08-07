/**
 * Independent hierarchical instance counter for corpus oracles.
 * Walks the same sheet tree as the parser; counts placed symbol instances
 * (not raw lib_id greps across disconnected files).
 */
import fs from "node:fs";
import path from "node:path";
import {
  extractProperty,
  extractSymbolInstanceBlocks,
  extractUuid,
} from "./sexpr.ts";

function findFiles(dir: string, pred: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
        walk(p);
      } else if (pred(ent.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function parseSheetRefs(
  src: string,
): Array<{ uuid: string; file: string }> {
  const refs: Array<{ uuid: string; file: string }> = [];
  // Lightweight: property Sheetfile/Sheetname + uuid on (sheet …) blocks
  const re =
    /\(sheet\b[\s\S]*?\(uuid\s+"?([0-9a-fA-F-]{36})"?[\s\S]*?\(property\s+"Sheetfile"\s+"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(src))) {
    const key = `${m[1]}|${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ uuid: m[1]!, file: m[2]! });
  }
  // Alternate property order (Sheetfile before uuid)
  const re2 =
    /\(sheet\b[\s\S]*?\(property\s+"Sheetfile"\s+"([^"]+)"[\s\S]*?\(uuid\s+"?([0-9a-fA-F-]{36})"?/gi;
  while ((m = re2.exec(src))) {
    const key = `${m[2]}|${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ uuid: m[2]!, file: m[1]! });
  }
  return refs;
}

function resolveSheetFile(fromSch: string, sheetfile: string): string | null {
  const base = path.dirname(fromSch);
  for (const c of [
    path.resolve(base, sheetfile),
    path.resolve(base, path.basename(sheetfile)),
  ]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function instancePaths(block: string): Array<{ path: string; reference: string }> {
  const out: Array<{ path: string; reference: string }> = [];
  const instStart = block.indexOf("(instances");
  if (instStart < 0) return out;
  const inst = block.slice(instStart);
  let idx = 0;
  while (idx < inst.length) {
    const start = inst.indexOf('(path "', idx);
    if (start < 0) break;
    const pathStart = start + 7;
    const pathEnd = inst.indexOf('"', pathStart);
    if (pathEnd < 0) break;
    const pth = inst.slice(pathStart, pathEnd);
    const next = inst.indexOf('(path "', pathEnd);
    const chunk = inst.slice(start, next < 0 ? inst.length : next);
    const reference = chunk.match(/\(reference\s+"([^"]+)"\)/)?.[1];
    if (reference) out.push({ path: pth, reference });
    idx = pathEnd + 1;
  }
  return out;
}

function isPower(refdes: string, libId: string): boolean {
  return (
    refdes.startsWith("#") ||
    /^PWR\d/i.test(refdes) ||
    /power[:\/]/i.test(libId) ||
    /power_flag/i.test(libId)
  );
}

export interface InstanceCountResult {
  total: number;
  nonPower: number;
  power: number;
  skippedQuestion: number;
  root: string;
}

export function countProjectInstances(projectDir: string): InstanceCountResult {
  const pros = findFiles(projectDir, (n) => n.endsWith(".kicad_pro"));
  pros.sort((a, b) => {
    // Mirror parser preference lightly: prefer production, avoid template
    const score = (p: string) => {
      const l = p.replace(/\\/g, "/").toLowerCase();
      let s = fs.statSync(p).size;
      if (l.includes("/production/")) s += 1e9;
      if (l.includes("template")) s -= 1e9;
      return s;
    };
    return score(b) - score(a);
  });

  let rootSch: string | null = null;
  let searchRoot = projectDir;
  if (pros.length) {
    const candid = pros[0]!.replace(/\.kicad_pro$/i, ".kicad_sch");
    if (fs.existsSync(candid)) {
      rootSch = candid;
      searchRoot = path.dirname(pros[0]!);
    }
  }
  if (!rootSch) {
    const all = findFiles(projectDir, (n) => n.endsWith(".kicad_sch"));
    if (!all.length) throw new Error(`No schematics in ${projectDir}`);
    rootSch = all.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]!;
  }

  let total = 0;
  let power = 0;
  let skippedQuestion = 0;

  const visit = (schPath: string, sheetPath: string) => {
    const src = fs.readFileSync(schPath, "utf8");
    for (const block of extractSymbolInstanceBlocks(src)) {
      const libId =
        block.match(/\(lib_id\s+"([^"]+)"/)?.[1] ?? "";
      const paths = instancePaths(block);
      const defaultRef = extractProperty(block, "Reference") ?? "";

      let refs: string[] = [];
      if (paths.length) {
        refs = paths
          .filter((p) => p.path === sheetPath)
          .map((p) => p.reference);
        // de-dupe references like parser
        refs = [...new Set(refs)];
      } else if (defaultRef) {
        refs = [defaultRef];
      }

      for (const ref of refs) {
        if (!ref || ref.endsWith("?")) {
          skippedQuestion++;
          continue;
        }
        total++;
        if (isPower(ref, libId)) power++;
      }
    }

    for (const child of parseSheetRefs(src)) {
      const childFile = resolveSheetFile(schPath, child.file);
      if (!childFile) continue;
      visit(childFile, `${sheetPath}/${child.uuid}`);
    }
  };

  const rootSrc = fs.readFileSync(rootSch, "utf8");
  const rootUuid = extractUuid(rootSrc) ?? "unknown-sheet";
  visit(rootSch, `/${rootUuid}`);

  return {
    total,
    nonPower: total - power,
    power,
    skippedQuestion,
    root: path.relative(searchRoot, rootSch).replace(/\\/g, "/"),
  };
}
