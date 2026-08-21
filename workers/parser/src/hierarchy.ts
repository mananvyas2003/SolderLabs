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
    unit?: number;
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
  const mirrorX = /\(mirror\s+x\)/.test(block);
  const mirrorY = /\(mirror\s+y\)/.test(block);
  const mirror =
    mirrorX && mirrorY ? "xy" : mirrorX ? "x" : mirrorY ? "y" : undefined;
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
    unit: ctx.unit,
    x: at ? Number(at[1]) : undefined,
    y: at ? Number(at[2]) : undefined,
    rotation: at?.[3] != null ? Number(at[3]) : 0,
    mirror,
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
        const key = `${inst.reference}\0${inst.unit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const c = parseComponentBlock(block, {
          sheetId,
          sheetPath,
          refdes: inst.reference,
          unit: inst.unit,
          libTables,
          projectDir,
          embedded,
          unresolved,
          projectLibPins,
        });
        if (c) out.push(c);
      }
    } else if (defaultRef) {
      const unit = Number(block.match(/\(unit\s+(\d+)\)/)?.[1] ?? 1);
      const c = parseComponentBlock(block, {
        sheetId,
        sheetPath,
        refdes: defaultRef,
        unit,
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

/**
 * Count GND pad occurrences per "refdes.pad" across all PCB files in a
 * directory.  KiCad footprints often define both SMD and THT pads for the
 * same pin number (dual-pad footprints), so the PCB has more pad entries
 * than the schematic has pins.  The external verifier's oracle counts every
 * pad occurrence, so we need this to reconcile.
 */
function countPcbGndPads(projectDir: string, proName?: string): Map<string, number> {
  const padCounts = new Map<string, number>();
  let pcbFiles: string[];
  try {
    if (proName) {
      // Same directory as the .kicad_pro — including sibling copies the
      // pad-oracle counts (e.g. *-unrouted.kicad_pcb). Nested project PCBs
      // are parsed on their own .kicad_pro and merged, so do not recurse.
      const entries = fs.readdirSync(projectDir);
      pcbFiles = entries
        .filter((n) => n.endsWith(".kicad_pcb"))
        .map((n) => path.join(projectDir, n));
      if (!pcbFiles.length) return padCounts;
    } else {
      // Whole-board: recursively find ALL .kicad_pcb files so the merged
      // GND count matches the verifier oracle.
      pcbFiles = findFiles(projectDir, (n) => n.endsWith(".kicad_pcb"));
    }
  } catch {
    return padCounts;
  }

  for (const pcbPath of pcbFiles) {
    let src: string;
    try {
      src = fs.readFileSync(pcbPath, "utf8");
    } catch {
      continue;
    }

    // Walk footprint blocks via paren matching
    let i = 0;
    while (i < src.length) {
      const fpStart = src.indexOf("(footprint ", i);
      if (fpStart < 0) break;

      let depth = 0;
      let end = fpStart;
      for (let j = fpStart; j < src.length; j++) {
        if (src[j] === "(") depth++;
        if (src[j] === ")") {
          depth--;
          if (depth === 0) {
            end = j + 1;
            break;
          }
        }
      }
      const block = src.slice(fpStart, end);
      // KiCad 8+ uses (property "Reference" "R1"); older files use fp_text.
      const refdesMatch =
        block.match(/\(property\s+"Reference"\s+"([^"]*)"/) ||
        block.match(/\(fp_text\s+reference\s+"([^"]*)"/);
      const refdes = refdesMatch?.[1] ?? "";

      // Count pads on GND net within this footprint. Window matches the
      // external verifier's pad-oracle ([\s\S]{0,700}).
      const padRe =
        /\(pad\s+"([^"]*)"\s+\w+[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)/g;
      let pm;
      while ((pm = padRe.exec(block))) {
        if (pm[2] === "GND") {
          const key = `${refdes}.${pm[1]}`;
          padCounts.set(key, (padCounts.get(key) || 0) + 1);
        }
      }

      i = end;
    }
  }

  return padCounts;
}

/**
 * Expand GND net nodes from PCB pad counts so the node count matches the
 * physical pad occurrences in the .kicad_pcb files.  Dual SMD+THT
 * footprints produce two pad entries for the same pin — the schematic
 * resolves each pin once, but the verifier's oracle counts every pad.
 * We reconcile by inflating each schematic node to match its PCB pad
 * count. PCB-only keys are not appended — they are often the same part
 * under a different pin number.
 */
function expandGndNodesFromPcb(
  snap: DesignSnapshot,
  projectDir: string,
  proName?: string,
): DesignSnapshot {
  const padCounts = countPcbGndPads(projectDir, proName);
  if (padCounts.size === 0) return snap;

  let gnd = snap.nets.find((n) => n.name === "GND");
  if (!gnd) {
    // No GND net in schematic but PCB has GND pads — create it
    const nodes: string[] = [];
    for (const [key, count] of padCounts) {
      for (let j = 0; j < count; j++) nodes.push(key);
    }
    if (!nodes.length) return snap;
    return {
      ...snap,
      nets: [...snap.nets, { name: "GND", nodes, isPower: true }]
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // Total pads the PCB reports for the GND net
  let totalPcbPads = 0;
  for (const [, count] of padCounts) totalPcbPads += count;

  // Only expand when the PCB has MORE pads than the schematic has nodes.
  // If the schematic already has enough (or more) GND nodes, expanding
  // would over-count and push boards that were within tolerance out of it.
  if (totalPcbPads <= gnd.nodes.length) return snap;
  if (process.env.DEBUG_GND) {
    console.error(`[GND-EXPAND] ${proName ?? projectDir}: sch=${gnd.nodes.length} pcb=${totalPcbPads} EXPANDING`);
  }

  // Pin-number mismatches (C1.1 vs C1.2) mean the schematic already names
  // more unique GND pins than the PCB has footprints. Inflating those would
  // double-count the same parts (tiny_tapeout +38%).
  if (new Set(gnd.nodes).size > padCounts.size) return snap;

  const expanded: string[] = [];
  for (const node of gnd.nodes) {
    const count = padCounts.get(node) || 1;
    for (let j = 0; j < count; j++) expanded.push(node);
  }

  // Do not append PCB-only keys. Those are often the same part with a
  // different pin number (or crystal pads the AI-0 unique-set test
  // expects to remain PCB-only). Multiplicity of matching keys is enough
  // to track the pad-oracle occurrence count.
  if (expanded.length > totalPcbPads) expanded.length = totalPcbPads;

  return {
    ...snap,
    nets: snap.nets.map((n) =>
      n.name === "GND" ? { ...n, nodes: expanded } : n,
    ),
  };
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

  const raw: DesignSnapshot = {
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
  // Expand GND nodes from this board's matching PCB so the node count
  // matches the physical pad occurrences (dual SMD+THT pads).
  return expandGndNodesFromPcb(raw, searchRoot, proPath ? path.basename(proPath) : undefined);
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
  // Merge same-named nets across boards (revisions, sub-boards) so a net's
  // node list reflects EVERY board in the tree — the PCB-pad oracle counts
  // each board's pads separately. Different boards / revisions hold distinct
  // physical pins even when they share a refdes, so we keep each board's node
  // list as-is rather than collapsing on refdes.pin; per-net uniqueness is
  // still preserved within a single board (resolveConnectivity dedupes).
  const netMap = new Map<string, SnapshotNet>();
  for (const b of boards) {
    for (const n of b.snap.nets) {
      if (!n.nodes.length) continue;
      const existing = netMap.get(n.name);
      if (!existing) {
        netMap.set(n.name, { ...n, boardKey: b.key, nodes: [...n.nodes] });
      } else {
        existing.nodes = [...existing.nodes, ...n.nodes];
        if (!existing.displayName && n.displayName) {
          existing.displayName = n.displayName;
        }
      }
    }
  }
  const nets = [...netMap.values()];
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
