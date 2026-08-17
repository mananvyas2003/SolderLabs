import type {
  DesignSnapshot,
  SnapshotComponent,
  SnapshotNet,
  SnapshotPin,
} from "@solderlab/design-core";

const TOL = 0.05;

type Pt = { x: number; y: number };

function roundKey(p: Pt): string {
  const x = Math.round(p.x / TOL) * TOL;
  const y = Math.round(p.y / TOL) * TOL;
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function parseAt(block: string): { x: number; y: number; rot: number } | null {
  const m = block.match(/\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?/);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]), rot: Number(m[3] ?? 0) };
}

function transformLocal(
  lx: number,
  ly: number,
  ax: number,
  ay: number,
  rotDeg: number,
  mirror?: "x" | "y" | "xy",
): Pt {
  // Library / lib_symbols coordinates are Y-up; the schematic sheet is Y-down.
  let x = lx;
  let y = -ly;
  // KiCad applies mirror before rotation, in schematic space.
  if (mirror === "y" || mirror === "xy") x = -x;
  if (mirror === "x" || mirror === "xy") y = -y;
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: ax + x * c - y * s, y: ay + x * s + y * c };
}

/** Common KiCad symbol pin endpoints (local coords) when lib_symbols absent */
function heuristicPins(
  libId: string,
): Array<{ number: string; name: string; x: number; y: number }> {
  const id = libId.toLowerCase();
  if (
    id.includes("device:r") ||
    id.includes("device:c") ||
    id.includes("device:led")
  ) {
    return [
      { number: "1", name: "~", x: 0, y: 3.81 },
      { number: "2", name: "~", x: 0, y: -3.81 },
    ];
  }
  if (
    id.includes("ap2112") ||
    id.includes("sot-23") ||
    id.includes("regulator")
  ) {
    return [
      { number: "1", name: "VIN", x: -2.54, y: 2.54 },
      { number: "2", name: "GND", x: 0, y: 2.54 },
      { number: "3", name: "EN", x: 2.54, y: 2.54 },
      { number: "4", name: "NC", x: -1.27, y: -2.54 },
      { number: "5", name: "VOUT", x: 1.27, y: -2.54 },
    ];
  }
  // Do not invent a 2-pin body for ICs — that is not extraction.
  return [];
}

function extractBlocks(src: string, tag: string): string[] {
  const needle = `(${tag}`;
  const blocks: string[] = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf(needle, i);
    if (start < 0) break;
    const after = src[start + needle.length];
    if (
      after &&
      after !== " " &&
      after !== "\n" &&
      after !== "\r" &&
      after !== "\t"
    ) {
      i = start + 1;
      continue;
    }
    let depth = 0;
    let j = start;
    let inStr = false;
    for (; j < src.length; j++) {
      const ch = src[j]!;
      if (ch === "\\" && inStr) {
        j++;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === "(") depth++;
      else if (ch === ")") {
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

type LibPinDef = {
  number: string;
  name: string;
  x: number;
  y: number;
  /** KiCad electrical type: `passive`, `power_in`, `power_out`, … */
  electrical?: string;
};

/** Hidden global power nets: power_in/out pins share a net named after the pin. */
function isGlobalPowerPinType(electrical: string | undefined): boolean {
  const t = (electrical ?? "").toLowerCase();
  return t === "power_in" || t === "power_out";
}

/**
 * Pin names that participate in KiCad's implicit global power net.
 * Only voltage-notation labels (+12V, 3V3, …). Do NOT include GND/VCC/VIN:
 * globally unioning every FPGA GND power_in pin amplifies a single
 * geometric near-miss into a board-wide rail merge.
 */
function isImplicitGlobalPowerName(name: string): boolean {
  const n = name.trim();
  if (!n || n === "~") return false;
  // +12V, -5V, +3.3V
  if (/^[+\-]\d/.test(n)) return true;
  // 3V3, 1V0, 3.3V
  if (/^\d+(\.\d+)?V\d*$/i.test(n)) return true;
  return false;
}

export function extractLibSymbolsPins(src: string): Map<string, LibPinDef[]> {
  const map = new Map<string, LibPinDef[]>();
  const libSec = extractBlocks(src, "lib_symbols")[0] ?? src;

  const re = /\(symbol\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  const starts: Array<{ name: string; idx: number }> = [];
  while ((m = re.exec(libSec))) {
    starts.push({ name: m[1], idx: m.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].idx : libSec.length;
    const block = libSec.slice(starts[i].idx, end);
    const pins: LibPinDef[] = [];
    for (const pb of extractBlocks(block, "pin")) {
      const at = parseAt(pb);
      if (!at) continue;
      const num = pb.match(/\(number\s+"([^"]+)"/)?.[1];
      const name = pb.match(/\(name\s+"([^"]+)"/)?.[1] ?? "~";
      const electrical = pb.match(/^\(pin\s+(\w+)/)?.[1];
      if (!num) continue;
      pins.push({ number: num, name, x: at.x, y: at.y, electrical });
    }
    if (pins.length) map.set(starts[i].name, pins);
  }
  return map;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Body-style keys for a KiCad unit. Style may be `_1` (normal) or `_0`
 * (De Morgan / some vendor libs). Unit 0 holds pins shared across units.
 */
function libPinKeysForUnit(short: string, libId: string, unit: number): string[] {
  return [
    `${short}_${unit}_1`,
    `${short}_${unit}_0`,
    `${libId}_${unit}_1`,
    `${libId}_${unit}_0`,
  ];
}

function mergePinsFromKeys(
  libPins: Map<string, LibPinDef[]>,
  keys: string[],
): LibPinDef[] {
  const merged: LibPinDef[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    for (const p of libPins.get(k) ?? []) {
      if (seen.has(p.number)) continue;
      seen.add(p.number);
      merged.push(p);
    }
  }
  return merged;
}

/**
 * Pins for a lib_id. When `unit` is set, includes that unit's bodies plus
 * unit-0 shared pins. Accepts body styles `_N_1` and `_N_0`. Never merges
 * aliased embeds like `Name_1_5_1`.
 */
export function lookupLibPins(
  libPins: Map<string, LibPinDef[]>,
  libId: string,
  unit?: number,
): LibPinDef[] | undefined {
  if (!libId) return undefined;
  const short = libId.includes(":") ? libId.slice(libId.indexOf(":") + 1) : libId;
  if (unit != null && unit > 0) {
    // Prefer this unit's body over unit-0 on pin-number collisions.
    const keys = [
      ...libPinKeysForUnit(short, libId, unit),
      ...libPinKeysForUnit(short, libId, 0),
    ];
    const pins = mergePinsFromKeys(libPins, keys);
    if (pins.length) return pins;
  }
  const direct = libPins.get(libId) ?? libPins.get(short);
  if (direct?.length) return direct;

  const unitRe = new RegExp(`^${escapeRegExp(short)}_(\\d+)_[01]$`);
  const unitKeys = [...libPins.keys()]
    .map((k) => {
      const m = k.match(unitRe);
      return m ? { k, u: Number(m[1]) } : null;
    })
    .filter((x): x is { k: string; u: number } => Boolean(x))
    .sort((a, b) => a.u - b.u);
  const merged = mergePinsFromKeys(
    libPins,
    unitKeys.map((x) => x.k),
  );
  return merged.length ? merged : undefined;
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let p = this.parent.get(x)!;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function extractQuoted(block: string, key: string): string | undefined {
  const re = new RegExp(`\\(${key}\\s+"([^"]*)"`);
  return block.match(re)?.[1];
}

const GROUND_TOKEN =
  /^(A?GND|PGND|DGND|CGND|GNDA|GNDD|VSS|VSSA|VSSD)$/i;
const POWER_TOKEN =
  /^(VCC|VDD|VBUS|VBAT|VPP|AVDD|DVDD|VDDA|VDDQ|VDDIO|VDDH|VIN|VOUT|\+?BATT|\+?(?:3V3|5V|1V8|1V2|1V0)|[0-9]+V[0-9]*)$/i;

/** KiCad stores `/` in net names as `{slash}`. */
export function unescapeKiCadNetName(name: string): string {
  return name.replace(/\{slash\}/gi, "/");
}

/** Overbar `~{RESET}` → `RESET`. Raw form is kept as `displayName`. */
export function stripOverbarSyntax(name: string): string {
  return name.replace(/~\{([^}]*)\}/g, "$1");
}

export function normalizeNetName(name: string): string {
  return stripOverbarSyntax(unescapeKiCadNetName(name)).trim();
}

/**
 * `ANALOG{A[0..5]}` → six members; `USB{VBUS, CC1, CC2}` → three.
 * Returns null when the name is not a bus vector.
 */
export function expandBusMembers(name: string): string[] | null {
  const canonical = normalizeNetName(name);
  const m = canonical.match(/^(.+)\{(.+)\}$/);
  if (!m) return null;
  const prefix = m[1]!;
  const inner = m[2]!.trim();
  const range = inner.match(/^([A-Za-z_]*)\[(\d+)\.\.(\d+)\]$/);
  if (range) {
    const stem = range[1] ?? "";
    const a = Number(range[2]);
    const b = Number(range[3]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const out: string[] = [];
    for (let i = lo; i <= hi; i++) out.push(`${prefix}{${stem}${i}}`);
    return out;
  }
  if (inner.includes(",")) {
    const parts = inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) return null;
    return parts.map((p) => `${prefix}{${p}}`);
  }
  return null;
}

export function isPowerFlagComponent(c: {
  refdes: string;
  libId?: string;
}): boolean {
  if (/^#PWR/i.test(c.refdes) || /^#FLG/i.test(c.refdes)) return true;
  const lib = (c.libId ?? "").toLowerCase();
  return (
    lib.startsWith("power:") ||
    lib.includes("power:") ||
    lib.startsWith("power/")
  );
}

/**
 * Token-boundary classification. `nRF52_VDD`, `AVDD`, `MCU_VDD`, `DDR_VDDQ`
 * are power. A `power:GND` (or GND-valued power flag) is ground regardless of
 * the net's display name.
 */
export function classifyNet(
  name: string,
  origin?: { libId?: string; value?: string },
): SnapshotNet["class"] {
  const lib = (origin?.libId ?? "").toLowerCase();
  if (
    lib.includes("power:gnd") ||
    /:gnd(?:\/|$)/i.test(lib) ||
    (lib.includes("power:") &&
      GROUND_TOKEN.test((origin?.value ?? "").trim()))
  ) {
    return "ground";
  }
  if (lib.startsWith("power:") || lib.includes("power:")) {
    const hint = (origin?.value || name).trim();
    if (GROUND_TOKEN.test(hint) || /(^|[^A-Za-z])GND([^A-Za-z]|$)/i.test(hint)) {
      return "ground";
    }
    return "power";
  }
  const tokens = name.split(/[^A-Za-z0-9+]+/).filter(Boolean);
  if (tokens.some((t) => GROUND_TOKEN.test(t))) return "ground";
  if (tokens.some((t) => POWER_TOKEN.test(t))) return "power";
  return "signal";
}

export function mergeLibPinMaps(
  into: Map<string, Array<{ number: string; name: string; x: number; y: number }>>,
  from: Map<string, Array<{ number: string; name: string; x: number; y: number }>>,
) {
  for (const [k, pins] of from) {
    const prev = into.get(k);
    if (!prev || pins.length > prev.length) into.set(k, pins);
  }
}

/**
 * Build connectivity from wires/junctions/labels + pin endpoints.
 * Inspired by parser_new net_resolver and NetDiff ConnectivityGraph.
 */
export function resolveConnectivity(
  src: string,
  components: SnapshotComponent[],
  extraLibPins?: Map<
    string,
    Array<{ number: string; name: string; x: number; y: number }>
  >,
): { components: SnapshotComponent[]; nets: SnapshotNet[] } {
  const uf = new UnionFind();
  const libPins = extractLibSymbolsPins(src);
  if (extraLibPins) mergeLibPinMaps(libPins, extraLibPins);
  const segments: Array<{ a: Pt; b: Pt }> = [];

  const noConnectKeys = new Set<string>();
  for (const nc of extractBlocks(src, "no_connect")) {
    const at = parseAt(nc);
    if (at) noConnectKeys.add(roundKey(at));
  }

  for (const wire of extractBlocks(src, "wire")) {
    const pts = [...wire.matchAll(/\(xy\s+([-\d.]+)\s+([-\d.]+)\)/g)].map(
      (m) => ({ x: Number(m[1]), y: Number(m[2]) }),
    );
    for (let i = 0; i + 1 < pts.length; i++) {
      uf.union(`p:${roundKey(pts[i])}`, `p:${roundKey(pts[i + 1])}`);
      segments.push({ a: pts[i]!, b: pts[i + 1]! });
    }
  }
  for (const s of segments) {
    stitchToWires(s.a);
    stitchToWires(s.b);
  }

  function pointOnSegment(p: Pt, a: Pt, b: Pt): boolean {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-12) {
      return Math.hypot(p.x - a.x, p.y - a.y) <= TOL * 2;
    }
    const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
    if (t < -0.02 || t > 1.02) return false;
    const qx = a.x + t * vx;
    const qy = a.y + t * vy;
    return Math.hypot(p.x - qx, p.y - qy) <= TOL * 2;
  }

  function stitchToWires(p: Pt) {
    const key = `p:${roundKey(p)}`;
    for (const s of segments) {
      if (pointOnSegment(p, s.a, s.b)) {
        uf.union(key, `p:${roundKey(s.a)}`);
        uf.union(key, `p:${roundKey(s.b)}`);
      }
    }
  }

  for (const j of extractBlocks(src, "junction")) {
    const at = parseAt(j);
    if (at) {
      uf.find(`p:${roundKey(at)}`);
      stitchToWires(at);
    }
  }

  const namedPoints: Array<{
    key: string;
    name: string;
    display: string;
    /** Labels / power flags outrank IC power_in pin names when naming a net. */
    priority: number;
  }> = [];
  const rememberLabel = (raw: string, at: Pt) => {
    const display = raw;
    const name = normalizeNetName(raw);
    const key = `p:${roundKey(at)}`;
    uf.find(key);
    stitchToWires(at);
    namedPoints.push({ key, name, display, priority: 2 });
  };
  for (const lab of extractBlocks(src, "label")) {
    const name =
      extractQuoted(lab, "label") ?? lab.match(/\(label\s+"([^"]+)"/)?.[1];
    const at = parseAt(lab);
    if (name && at) rememberLabel(name, at);
  }
  for (const lab of extractBlocks(src, "global_label")) {
    const name =
      extractQuoted(lab, "global_label") ??
      lab.match(/\(global_label\s+"([^"]+)"/)?.[1];
    const at = parseAt(lab);
    if (name && at) rememberLabel(name, at);
  }
  // Hierarchical labels (child → parent sheet pin of same name)
  for (const lab of extractBlocks(src, "hierarchical_label")) {
    const name =
      extractQuoted(lab, "hierarchical_label") ??
      lab.match(/\(hierarchical_label\s+"([^"]+)"/)?.[1];
    const at = parseAt(lab);
    if (name && at) rememberLabel(name, at);
  }
  // Sheet box pins on the parent (KiCad 7+ `(pin "N" …)` inside `(sheet …)`)
  for (const sheet of extractBlocks(src, "sheet")) {
    if (sheet.startsWith("(sheet_instances") || sheet.startsWith("(sheet_pin")) {
      continue;
    }
    for (const m of sheet.matchAll(
      /\(pin\s+"([^"]+)"\s+\w+[\s\S]*?\(at\s+([-\d.]+)\s+([-\d.]+)/g,
    )) {
      rememberLabel(m[1]!, { x: Number(m[2]), y: Number(m[3]) });
    }
    for (const sp of extractBlocks(sheet, "sheet_pin")) {
      const pname =
        extractQuoted(sp, "sheet_pin") ??
        sp.match(/\(sheet_pin\s+"([^"]+)"/)?.[1];
      const at = parseAt(sp);
      if (pname && at) rememberLabel(pname, at);
    }
  }

  const pinPoints: Array<{
    pinId: string;
    key: string;
    number: string;
    name: string;
    refdes: string;
    sheetPath: string;
    unit?: number;
  }> = [];

  const powerMeta = new Map<string, { libId?: string; value: string }>();

  for (const c of components) {
    const libId = c.libId ?? "";
    const power = isPowerFlagComponent(c);
    if (power) {
      powerMeta.set(c.refdes, { libId: c.libId, value: c.value });
    }
    let pins = lookupLibPins(libPins, libId, c.unit);
    if (!pins?.length) {
      pins = power
        ? [{ number: "1", name: c.value || "1", x: 0, y: 0 }]
        : heuristicPins(libId || "Device:R");
    }
    if (!pins.length) continue;

    const ax = c.x ?? 0;
    const ay = c.y ?? 0;
    const rot = c.rotation ?? 0;
    for (const pin of pins) {
      const world = transformLocal(pin.x, pin.y, ax, ay, rot, c.mirror);
      const pinId = `${c.refdes}.${pin.number}`;
      const isolated =
        (pin.electrical ?? "").toLowerCase() === "no_connect" ||
        noConnectKeys.has(roundKey(world));
      const key = isolated ? `nc:${pinId}` : `p:${roundKey(world)}`;
      uf.find(key);
      uf.union(key, `pin:${pinId}`);
      if (!isolated) stitchToWires(world);
      pinPoints.push({
        pinId,
        key,
        number: pin.number,
        name: pin.name,
        refdes: c.refdes,
        sheetPath: c.sheetPath ?? "",
        unit: c.unit,
      });
      if (isolated) continue;
      if (power) {
        const netName = normalizeNetName(c.value || pin.name || "GND");
        uf.union(`pin:${pinId}`, `name:${netName}`);
        namedPoints.push({
          key,
          name: netName,
          display: c.value || netName,
          priority: 3,
        });
      } else if (isGlobalPowerPinType(pin.electrical)) {
        const netName = normalizeNetName(pin.name);
        if (isImplicitGlobalPowerName(pin.name)) {
          // KiCad: power_in/out pins with voltage-notation names are
          // globally connected even without wires (PCIe +12V → +12V).
          uf.union(`pin:${pinId}`, `name:${netName}`);
          namedPoints.push({
            key,
            name: netName,
            display: pin.name,
            priority: 1,
          });
        } else if (netName && netName !== "~") {
          // Same-name power_in pins on one IC are internally tied
          // (regulator VIN). Do not promote VIN/GND/VCCINT to a
          // board-wide implicit net — that merged FPGA rails.
          uf.union(`pin:${pinId}`, `localpwr:${c.refdes}:${netName}`);
        }
      }
    }
  }

  for (const np of namedPoints) {
    uf.union(np.key, `name:${np.name}`);
  }

  const groups = new Map<
    string,
    {
      pins: typeof pinPoints;
      names: string[];
      displays: string[];
      priorities: number[];
    }
  >();
  for (const pp of pinPoints) {
    const root = uf.find(pp.key);
    if (!groups.has(root)) {
      groups.set(root, { pins: [], names: [], displays: [], priorities: [] });
    }
    groups.get(root)!.pins.push(pp);
  }
  for (const np of namedPoints) {
    const root = uf.find(np.key);
    if (!groups.has(root)) {
      groups.set(root, { pins: [], names: [], displays: [], priorities: [] });
    }
    groups.get(root)!.names.push(np.name);
    groups.get(root)!.displays.push(np.display);
    groups.get(root)!.priorities.push(np.priority);
  }

  const nets: SnapshotNet[] = [];
  const pinNet = new Map<string, string>();
  let anon = 1;

  const upsertNet = (net: SnapshotNet) => {
    const existing = nets.find((x) => x.name === net.name);
    if (existing) {
      existing.nodes = [...new Set([...existing.nodes, ...net.nodes])].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      );
      if (!existing.displayName && net.displayName) {
        existing.displayName = net.displayName;
      }
    } else {
      nets.push(net);
    }
  };

  for (const g of groups.values()) {
    if (!g.pins.length && !g.names.length) continue;
    // Prefer power-flag / label names over IC power_in pin names (VIN vs +12V).
    let bestPri = -1;
    let name: string | undefined;
    let display: string | undefined;
    for (let i = 0; i < g.names.length; i++) {
      const n = g.names[i]!;
      const pri = g.priorities[i] ?? 0;
      // Prefer ground tokens over voltage rails when a group was over-merged;
      // power flags (pri 3) still dominate either way.
      const railBonus = /^(A?GND|PGND|DGND|VSS)$/i.test(n)
        ? 1.0
        : /VDD|VCC|^[+\-]?\d/i.test(n)
          ? 0.5
          : 0;
      const score = pri + railBonus;
      if (!name || score > bestPri) {
        bestPri = score;
        name = n;
        display = g.displays[i];
      }
    }
    if (!name) {
      const first = g.pins[0];
      name = first
        ? `Net-(${first.refdes}-Pad${first.number})`
        : `N$${anon++}`;
    }
    const members = expandBusMembers(name);
    if (members && !g.pins.length) {
      // Bus vector with no attached pins — do not emit phantom member nets.
      continue;
    }
    const nodes = [...new Set(g.pins.map((p) => p.pinId))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    for (const n of nodes) pinNet.set(n, name);
    const originPin = g.pins.find((p) => powerMeta.has(p.refdes));
    const origin = originPin ? powerMeta.get(originPin.refdes) : undefined;
    const cls = classifyNet(name, origin);
    upsertNet({
      name,
      displayName: display && display !== name ? display : undefined,
      class: cls,
      nodes,
      isNamed: !/^N\$|^Net-\(/i.test(name),
      isPower: cls !== "signal",
    });
  }

  const netMap = new Map<string, SnapshotNet>();
  for (const n of nets) {
    const e = netMap.get(n.name);
    if (!e) netMap.set(n.name, { ...n });
    else {
      e.nodes = [...new Set([...e.nodes, ...n.nodes])].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
      if (!e.displayName && n.displayName) e.displayName = n.displayName;
    }
  }

  const enriched = components.map((c) => {
    const pins: SnapshotPin[] = [];
    for (const pp of pinPoints.filter(
      (p) =>
        p.refdes === c.refdes &&
        (p.sheetPath ?? "") === (c.sheetPath ?? "") &&
        (p.unit ?? 1) === (c.unit ?? 1),
    )) {
      pins.push({
        number: pp.number,
        name: pp.name,
        net: pinNet.get(pp.pinId) ?? "",
      });
    }
    pins.sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true }),
    );
    return { ...c, pins };
  });

  return {
    components: enriched,
    nets: [...netMap.values()]
      .filter((n) => n.nodes.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// silence unused when DesignSnapshot imported for docs
void (null as unknown as DesignSnapshot);
