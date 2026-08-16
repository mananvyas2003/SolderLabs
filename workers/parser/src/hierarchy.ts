import { attachMcuDetection } from "@solderlab/bsc";
import type {
  DesignSnapshot,
  ParseWarning,
  SnapshotComponent,
  SnapshotNet,
  SnapshotSheet,
} from "@solderlab/design-core";
import fs from "node:fs";
import path from "node:path";
import { resolveConnectivity, extractLibSymbolsPins, mergeLibPinMaps } from "./connectivity";
import { loadProjectLibTables, resolveLibId, type LibTableEntry } from "./libs";
import {
  extractBlocks,
  extractProperty,
  extractQuoted,
  extractSymbolInstanceBlocks,
  extractUuid,
} from "./sexpr";

export interface HierarchicalParseMeta {
  unresolvedLibs: string[];
  projectRoot: string;
  warnings: string[];
}

interface SheetRef {
  uuid: string;
  name: string;
  file: string;
  pins: Array<{ name: string; x: number; y: number }>;
}

interface InstanceRef {
  path: string;
  reference: string;
  unit: number;
}

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

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function sheetFileUuid(src: string): string {
  return extractUuid(src) ?? "unknown-sheet";
}

function extractEmbeddedNicknames(src: string): Set<string> {
  const set = new Set<string>();
  const libSec = extractBlocks(src, "lib_symbols")[0];
  if (!libSec) return set;
  for (const m of libSec.matchAll(/\(symbol\s+"([^"]+)"/g)) {
    const full = m[1]!;
    set.add(full.includes(":") ? full.split(":")[0]! : full);
  }
  return set;
}

function parseSheetRefs(src: string): SheetRef[] {
  const refs: SheetRef[] = [];
  for (const block of extractBlocks(src, "sheet")) {
    if (block.startsWith("(sheet_instances") || block.startsWith("(sheet_pin")) {
      continue;
    }
    const uuid = extractUuid(block);
    const name =
      extractProperty(block, "Sheetname") ??
      extractProperty(block, "Sheet name") ??
      "sheet";
    const file =
      extractProperty(block, "Sheetfile") ??
      extractProperty(block, "Sheet file");
    if (!uuid || !file) continue;
    const pins: SheetRef["pins"] = [];
    for (const m of block.matchAll(
      /\(pin\s+"([^"]+)"\s+\w+[\s\S]*?\(at\s+([-\d.]+)\s+([-\d.]+)/g,
    )) {
      pins.push({ name: m[1]!, x: Number(m[2]), y: Number(m[3]) });
    }
    for (const sp of extractBlocks(block, "sheet_pin")) {
      const pname =
        extractQuoted(sp, "sheet_pin") ??
        sp.match(/\(sheet_pin\s+"([^"]+)"/)?.[1];
      const at = sp.match(/\(at\s+([-\d.]+)\s+([-\d.]+)/);
      if (pname && at) {
        pins.push({ name: pname, x: Number(at[1]), y: Number(at[2]) });
      }
    }
    refs.push({ uuid, name, file, pins });
  }
  return refs;
}

function parseInstances(block: string): InstanceRef[] {
  const out: InstanceRef[] = [];
  const inst = extractBlocks(block, "instances")[0];
  if (!inst) return out;
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
    const unit = Number(chunk.match(/\(unit\s+(\d+)\)/)?.[1] ?? 1);
    if (reference) out.push({ path: pth, reference, unit });
    idx = pathEnd + 1;
  }
  return out;
}

function parseComponentBlock(
  block: string,
  ctx: {
    sheetId: string;
    sheetPath: string;
    refdes: string;
    libTables: LibTableEntry[];
    projectDir: string;
    embedded: Set<string>;
    unresolved: Set<string>;
    projectLibPins: Map<
      string,
      Array<{ number: string; name: string; x: number; y: number }>
    >;
  },
): SnapshotComponent | null {
  if (!ctx.refdes || ctx.refdes.endsWith("?")) return null;
  const value = extractProperty(block, "Value") ?? "";
  const footprint = extractProperty(block, "Footprint") ?? "";
  const mpn =
    extractProperty(block, "MPN") ??
    extractProperty(block, "Manufacturer_Part_Number") ??
    extractProperty(block, "PartNumber");
  const manufacturer = extractProperty(block, "Manufacturer");
  const libId = extractQuoted(block, "lib_id");
  const uuid = extractUuid(block);
  const at = block.match(/\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?/);
  const libRes = resolveLibId(
    libId,
    ctx.libTables,
    ctx.projectDir,
    ctx.embedded,
  );
  if (libRes.status === "unresolved" && libRes.nickname) {
    ctx.unresolved.add(libRes.nickname);
  }
  if (libRes.resolvedPath) {
    mergeLibPinMaps(
      ctx.projectLibPins,
      extractLibSymbolsPins(fs.readFileSync(libRes.resolvedPath, "utf8")),
    );
  }
  return {
    refdes: ctx.refdes,
    value,
    footprint,
    mpn: mpn || undefined,
    manufacturer: manufacturer || undefined,
    libId: libId || undefined,
    uuid: uuid || undefined,
    sheetId: ctx.sheetId,
    sheetPath: ctx.sheetPath,
    libraryStatus: libRes.status === "unresolved" ? "unresolved" : "ok",
    x: at ? Number(at[1]) : undefined,
    y: at ? Number(at[2]) : undefined,
    rotation: at?.[3] != null ? Number(at[3]) : 0,
  };
}

function componentsForSheetInstance(
  src: string,
  sheetPath: string,
  sheetId: string,
  libTables: LibTableEntry[],
  projectDir: string,
  unresolved: Set<string>,
  projectLibPins: Map<
    string,
    Array<{ number: string; name: string; x: number; y: number }>
  >,
): SnapshotComponent[] {
  mergeLibPinMaps(projectLibPins, extractLibSymbolsPins(src));
  const embedded = extractEmbeddedNicknames(src);
  const out: SnapshotComponent[] = [];
  for (const block of extractSymbolInstanceBlocks(src)) {
    const instances = parseInstances(block);
    const defaultRef = extractProperty(block, "Reference");
    const matching = instances.filter((i) => i.path === sheetPath);
    if (matching.length) {
      const seen = new Set<string>();
      for (const inst of matching) {
        if (seen.has(inst.reference)) continue;
        seen.add(inst.reference);
        const c = parseComponentBlock(block, {
          sheetId,
          sheetPath,
          refdes: inst.reference,
          libTables,
          projectDir,
          embedded,
          unresolved,
          projectLibPins,
        });
        if (c) out.push(c);
      }
    } else if (defaultRef) {
      const c = parseComponentBlock(block, {
        sheetId,
        sheetPath,
        refdes: defaultRef,
        libTables,
        projectDir,
        embedded,
        unresolved,
        projectLibPins,
      });
      if (c) out.push(c);
    }
  }
  return out;
}

function mergeNets(into: Map<string, SnapshotNet>, nets: SnapshotNet[]) {
  for (const n of nets) {
    const existing = into.get(n.name);
    if (!existing) {
      into.set(n.name, { ...n, nodes: [...n.nodes] });
    } else {
      existing.nodes = [...new Set([...existing.nodes, ...n.nodes])].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      );
      if (!existing.displayName && n.displayName) {
        existing.displayName = n.displayName;
      }
    }
  }
}

function applyHierarchicalNetMerge(
  parentNets: SnapshotNet[],
  childNets: SnapshotNet[],
  sheetPins: SheetRef["pins"],
): SnapshotNet[] {
  const pinNames = new Set(sheetPins.map((p) => p.name));
  const byName = new Map<string, SnapshotNet>();
  mergeNets(byName, parentNets);
  for (const n of childNets) {
    const existing = byName.get(n.name);
    if (existing) {
      // Shared name: global label / power / hierarchical sheet pin
      existing.nodes = [...new Set([...existing.nodes, ...n.nodes])].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      );
    } else if (pinNames.has(n.name) || n.isNamed || n.isPower) {
      byName.set(n.name, { ...n, nodes: [...n.nodes] });
    } else {
      byName.set(n.name, { ...n, nodes: [...n.nodes] });
    }
  }
  return [...byName.values()];
}

export function discoverProjectRoots(dir: string): string[] {
  return findFiles(dir, (n) => n.endsWith(".kicad_pro")).sort((a, b) =>
    a.replace(/\\/g, "/").localeCompare(b.replace(/\\/g, "/")),
  );
}

function resolveSheetFile(fromSch: string, sheetfile: string): string | null {
  const base = path.dirname(fromSch);
  const candidates = [
    path.resolve(base, sheetfile),
    path.resolve(base, path.basename(sheetfile)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Hierarchical project parse starting at a directory or `.kicad_pro`.
 * Walks sheet instances (multi-instance subsheets produce distinct components).
 */
/**
 * Parse a single `.kicad_pro` (or a directory that contains one schematic root).
 * Multi-board trees are handled by `parseKicadProject`.
 */
function parseSingleKicadProject(projectDirOrPro: string): DesignSnapshot {
  let proPath: string | null = null;
  let rootSch: string | null = null;
  let projectDir: string;
  const searchRoot = projectDirOrPro.endsWith(".kicad_pro")
    ? path.dirname(projectDirOrPro)
    : projectDirOrPro;

  if (projectDirOrPro.endsWith(".kicad_pro")) {
    proPath = projectDirOrPro;
    projectDir = path.dirname(proPath);
    const candid = proPath.replace(/\.kicad_pro$/i, ".kicad_sch");
    if (fs.existsSync(candid)) rootSch = candid;
  } else {
    projectDir = projectDirOrPro;
    const pros = discoverProjectRoots(projectDir);
    if (pros.length) {
      proPath = pros[0]!;
      projectDir = path.dirname(proPath);
      const candid = proPath.replace(/\.kicad_pro$/i, ".kicad_sch");
      if (fs.existsSync(candid)) rootSch = candid;
    }
  }

  if (!rootSch) {
    const all = findFiles(searchRoot, (n) => n.endsWith(".kicad_sch"));
    if (!all.length) {
      const pcbs = findFiles(searchRoot, (n) => n.endsWith(".kicad_pcb"));
      if (pcbs.length) {
        const rel = path
          .relative(searchRoot, pcbs[0]!)
          .replace(/\\/g, "/");
        return {
          schemaVersion: 1,
          tool: { name: "kicad" },
          sheets: [],
          components: [],
          nets: [],
          warnings: [
            {
              code: "pcb-only",
              message: `No .kicad_sch files found; PCB-only snapshot (${rel})`,
            },
          ],
          parseStatus: "ok",
          meta: {
            sheetCount: 0,
            componentCount: 0,
            netCount: 0,
            unresolvedLibs: [],
            projectRoot: rel,
          },
        };
      }
      throw new Error("No .kicad_sch files found in upload");
    }
    const referenced = new Set<string>();
    for (const f of all) {
      for (const ref of parseSheetRefs(readText(f))) {
        const resolved = resolveSheetFile(f, ref.file);
        if (resolved) referenced.add(path.normalize(resolved));
      }
    }
    const roots = all.filter((f) => !referenced.has(path.normalize(f)));
    rootSch = (roots.length ? roots : all).sort(
      (a, b) => fs.statSync(b).size - fs.statSync(a).size,
    )[0]!;
    projectDir = path.dirname(rootSch);
  }

  const libTables = loadProjectLibTables(projectDir).symbol;
  const unresolved = new Set<string>();
  const warnings: ParseWarning[] = [];
  const projectLibPins = new Map<
    string,
    Array<{ number: string; name: string; x: number; y: number }>
  >();
  const rootSrc = readText(rootSch);
  const rootUuid = sheetFileUuid(rootSrc);
  const rootPath = `/${rootUuid}`;
  const rootName = path.basename(rootSch, ".kicad_sch");

  const sheets: SnapshotSheet[] = [];
  const components: SnapshotComponent[] = [];

  const visit = (
    schPath: string,
    sheetPath: string,
    sheetId: string,
    sheetTitle: string,
  ): SnapshotNet[] => {
    const src = readText(schPath);
    sheets.push({ id: sheetId, name: sheetTitle, title: sheetTitle });
    const comps = componentsForSheetInstance(
      src,
      sheetPath,
      sheetId,
      libTables,
      projectDir,
      unresolved,
      projectLibPins,
    );
    const resolved = resolveConnectivity(src, comps, projectLibPins);
    components.push(...resolved.components);
    let combined = resolved.nets;

    for (const child of parseSheetRefs(src)) {
      const childFile = resolveSheetFile(schPath, child.file);
      if (!childFile) {
        warnings.push({
          code: "missing-sheet",
          message: `Missing sheet file: ${child.file} from ${schPath}`,
        });
        continue;
      }
      const childPath = `${sheetPath}/${child.uuid}`;
      const childNets = visit(childFile, childPath, child.name, child.name);
      combined = applyHierarchicalNetMerge(combined, childNets, child.pins);
    }
    return combined;
  };

  const topNets = visit(rootSch, rootPath, rootName, rootName);
  const netMap = new Map<string, SnapshotNet>();
  mergeNets(netMap, topNets);

  const byKey = new Map<string, SnapshotComponent>();
  for (const c of components) {
    const key =
      (c.sheetPath && c.uuid && `${c.sheetPath}\0${c.uuid}`) ||
      `${c.sheetPath ?? c.sheetId}\0${c.refdes}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const uniq = [...byKey.values()].sort((a, b) =>
    a.refdes.localeCompare(b.refdes, undefined, { numeric: true }),
  );

  const unresolvedLibs = [...unresolved].sort();
  const missingSheet = warnings.some((w) => w.code === "missing-sheet");
  const boardKey = path.basename(proPath ?? rootSch);

  const ns = (id: string) => `${boardKey}:${id}`;
  const sheetsNs = sheets.map((s) => ({ ...s, id: ns(s.id) }));
  const uniqNs = uniq.map((c) => ({
    ...c,
    boardKey,
    sheetId: c.sheetId.startsWith(`${boardKey}:`) ? c.sheetId : ns(c.sheetId),
  }));
  const netsNs = [...netMap.values()]
    .filter((n) => n.nodes.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((n) => ({ ...n, boardKey }));

  return {
    schemaVersion: 1,
    tool: { name: "kicad", version: extractQuoted(rootSrc, "version") },
    sheets: sheetsNs,
    components: uniqNs,
    nets: netsNs,
    boards: [{ key: boardKey, name: path.basename(boardKey, path.extname(boardKey)) }],
    warnings,
    parseStatus: missingSheet ? "partial" : "ok",
    meta: {
      sheetCount: sheetsNs.length,
      componentCount: uniqNs.length,
      netCount: netsNs.length,
      unresolvedLibs,
      projectRoot: path
        .relative(searchRoot, proPath ?? rootSch)
        .replace(/\\/g, "/"),
    },
  };
}

function mergeBoardSnapshots(
  searchRoot: string,
  snaps: DesignSnapshot[],
  proPaths: string[],
): DesignSnapshot {
  const boards = snaps.map((s, i) => {
    const key = path.basename(proPaths[i]!);
    return {
      key,
      name: path.basename(proPaths[i]!, ".kicad_pro"),
      snap: s,
    };
  });
  const warnings: ParseWarning[] = [
    ...snaps.flatMap((s) => s.warnings ?? []),
    {
      code: "multi-board",
      message: `Parsed ${boards.length} board roots`,
    },
  ];
  const components = boards.flatMap((b) =>
    b.snap.components.map((c) => ({
      ...c,
      boardKey: b.key,
      sheetId: c.sheetId.startsWith(`${b.key}:`)
        ? c.sheetId
        : `${b.key}:${c.sheetId}`,
    })),
  );
  const nets = boards.flatMap((b) =>
    b.snap.nets
      .filter((n) => n.nodes.length > 0)
      .map((n) => ({ ...n, boardKey: b.key })),
  );
  const sheets = boards.flatMap((b) =>
    b.snap.sheets.map((sh) => ({
      ...sh,
      id: sh.id.startsWith(`${b.key}:`) ? sh.id : `${b.key}:${sh.id}`,
    })),
  );
  const unresolvedLibs = [
    ...new Set(snaps.flatMap((s) => s.meta.unresolvedLibs ?? [])),
  ].sort();
  const missingSheet = warnings.some((w) => w.code === "missing-sheet");
  return {
    schemaVersion: 1,
    tool: snaps[0]?.tool ?? { name: "kicad" },
    sheets,
    components,
    nets,
    boards: boards.map((b) => ({ key: b.key, name: b.name })),
    warnings,
    parseStatus: missingSheet ? "partial" : "ok",
    meta: {
      sheetCount: sheets.length,
      componentCount: components.length,
      netCount: nets.length,
      unresolvedLibs,
      projectRoot: boards.map((b) => b.key).join(","),
    },
  };
}

export function parseKicadProject(projectDirOrPro: string): DesignSnapshot {
  let snapshot: DesignSnapshot;
  if (projectDirOrPro.endsWith(".kicad_pro")) {
    snapshot = parseSingleKicadProject(projectDirOrPro);
  } else {
    const pros = discoverProjectRoots(projectDirOrPro);
    snapshot =
      pros.length > 1
        ? mergeBoardSnapshots(
            projectDirOrPro,
            pros.map((p) => parseSingleKicadProject(p)),
            pros,
          )
        : parseSingleKicadProject(pros[0] ?? projectDirOrPro);
  }
  return attachMcuDetection(snapshot);
}

export function parseKicadProjectDirHierarchical(dir: string): DesignSnapshot {
  return parseKicadProject(dir);
}
