import type {
  DesignSnapshot,
  SnapshotComponent,
  SnapshotNet,
  SnapshotPin,
} from "@flux/design-core";

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
): Pt {
  const r = (rotDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: ax + lx * c - ly * s, y: ay + lx * s + ly * c };
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
  return [
    { number: "1", name: "1", x: 0, y: 2.54 },
    { number: "2", name: "2", x: 0, y: -2.54 },
  ];
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

function extractLibSymbolsPins(src: string): Map<
  string,
  Array<{ number: string; name: string; x: number; y: number }>
> {
  const map = new Map<
    string,
    Array<{ number: string; name: string; x: number; y: number }>
  >();
  const libSec = extractBlocks(src, "lib_symbols")[0];
  if (!libSec) return map;

  const re = /\(symbol\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  const starts: Array<{ name: string; idx: number }> = [];
  while ((m = re.exec(libSec))) {
    starts.push({ name: m[1], idx: m.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].idx : libSec.length;
    const block = libSec.slice(starts[i].idx, end);
    const pins: Array<{ number: string; name: string; x: number; y: number }> =
      [];
    for (const pb of extractBlocks(block, "pin")) {
      const at = parseAt(pb);
      if (!at) continue;
      const num = pb.match(/\(number\s+"([^"]+)"/)?.[1];
      const name = pb.match(/\(name\s+"([^"]+)"/)?.[1] ?? "~";
      if (!num) continue;
      pins.push({ number: num, name, x: at.x, y: at.y });
    }
    if (pins.length) map.set(starts[i].name, pins);
  }
  return map;
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

function classifyNet(name: string): SnapshotNet["class"] {
  if (/GND|AGND|PGND|VSS/i.test(name)) return "ground";
  if (/^(VCC|VDD|VBUS|\+|[0-9]+V)/i.test(name)) return "power";
  return "signal";
}

/**
 * Build connectivity from wires/junctions/labels + pin endpoints.
 * Inspired by parser_new net_resolver and NetDiff ConnectivityGraph.
 */
export function resolveConnectivity(
  src: string,
  components: SnapshotComponent[],
): { components: SnapshotComponent[]; nets: SnapshotNet[] } {
  const uf = new UnionFind();
  const libPins = extractLibSymbolsPins(src);

  for (const wire of extractBlocks(src, "wire")) {
    const pts = [...wire.matchAll(/\(xy\s+([-\d.]+)\s+([-\d.]+)\)/g)].map(
      (m) => ({ x: Number(m[1]), y: Number(m[2]) }),
    );
    for (let i = 0; i + 1 < pts.length; i++) {
      uf.union(`p:${roundKey(pts[i])}`, `p:${roundKey(pts[i + 1])}`);
    }
  }

  for (const j of extractBlocks(src, "junction")) {
    const at = parseAt(j);
    if (at) uf.find(`p:${roundKey(at)}`);
  }

  const namedPoints: Array<{ key: string; name: string }> = [];
  for (const lab of extractBlocks(src, "label")) {
    const name =
      extractQuoted(lab, "label") ?? lab.match(/\(label\s+"([^"]+)"/)?.[1];
    const at = parseAt(lab);
    if (name && at) {
      const key = `p:${roundKey(at)}`;
      uf.find(key);
      namedPoints.push({ key, name });
    }
  }
  for (const lab of extractBlocks(src, "global_label")) {
    const name =
      extractQuoted(lab, "global_label") ??
      lab.match(/\(global_label\s+"([^"]+)"/)?.[1];
    const at = parseAt(lab);
    if (name && at) {
      const key = `p:${roundKey(at)}`;
      uf.find(key);
      namedPoints.push({ key, name });
    }
  }

  const pinPoints: Array<{
    pinId: string;
    key: string;
    number: string;
    name: string;
    refdes: string;
  }> = [];

  for (const c of components) {
    const libId = c.libId ?? "";
    let pins =
      libPins.get(libId) ??
      [...libPins.entries()].find(([k]) => k.startsWith(`${libId}_`))?.[1];
    if (!pins?.length) pins = heuristicPins(libId || "Device:R");

    const ax = c.x ?? 0;
    const ay = c.y ?? 0;
    const rot = c.rotation ?? 0;
    for (const pin of pins) {
      const world = transformLocal(pin.x, pin.y, ax, ay, rot);
      const key = `p:${roundKey(world)}`;
      const pinId = `${c.refdes}.${pin.number}`;
      uf.find(key);
      uf.union(key, `pin:${pinId}`);
      pinPoints.push({
        pinId,
        key,
        number: pin.number,
        name: pin.name,
        refdes: c.refdes,
      });
    }
  }

  for (const np of namedPoints) {
    uf.union(np.key, `name:${np.name}`);
  }

  const groups = new Map<
    string,
    { pins: typeof pinPoints; names: string[] }
  >();
  for (const pp of pinPoints) {
    const root = uf.find(pp.key);
    if (!groups.has(root)) groups.set(root, { pins: [], names: [] });
    groups.get(root)!.pins.push(pp);
  }
  for (const np of namedPoints) {
    const root = uf.find(np.key);
    if (!groups.has(root)) groups.set(root, { pins: [], names: [] });
    groups.get(root)!.names.push(np.name);
  }

  const nets: SnapshotNet[] = [];
  const pinNet = new Map<string, string>();
  let anon = 1;

  for (const g of groups.values()) {
    if (!g.pins.length && !g.names.length) continue;
    let name = g.names.find((n) => /GND|VDD|VCC/i.test(n)) ?? g.names[0];
    if (!name) {
      const first = g.pins[0];
      name = first
        ? `Net-(${first.refdes}-Pad${first.number})`
        : `N$${anon++}`;
    }
    const nodes = [...new Set(g.pins.map((p) => p.pinId))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    for (const n of nodes) pinNet.set(n, name);
    const existing = nets.find((x) => x.name === name);
    if (existing) {
      existing.nodes = [...new Set([...existing.nodes, ...nodes])].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    } else {
      nets.push({
        name,
        class: classifyNet(name),
        nodes,
        isNamed: !/^N\$|^Net-\(/i.test(name),
        isPower: classifyNet(name) !== "signal",
      });
    }
  }

  const netMap = new Map<string, SnapshotNet>();
  for (const n of nets) {
    const e = netMap.get(n.name);
    if (!e) netMap.set(n.name, { ...n });
    else {
      e.nodes = [...new Set([...e.nodes, ...n.nodes])].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    }
  }

  const enriched = components.map((c) => {
    const pins: SnapshotPin[] = [];
    for (const pp of pinPoints.filter((p) => p.refdes === c.refdes)) {
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
    nets: [...netMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// silence unused when DesignSnapshot imported for docs
void (null as unknown as DesignSnapshot);
