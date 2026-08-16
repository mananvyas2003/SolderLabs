import type {
  DesignSnapshot,
  SnapshotComponent,
  SnapshotNet,
} from "@solderlab/design-core";
import { matchesMcuIdentity } from "./mcu-identity.ts";
import type { BscMcu, ConfidenceNote } from "./types.ts";

/** Minimum computed score to emit an MCU. Not a confidence literal. */
export const MCU_SCORE_THRESHOLD = 0.4;

const MCU_PIN_FN_RE =
  /\b(SWDIO|SWCLK|SWDCLK|SWD_CLK|SWD_IO|TCK|TMS|TDI|TDO|NRST|NRESET|RESET_N|RSTN|XTAL|XTALIN|XTALOUT|OSC_IN|OSC_OUT|OSCI|OSCO|VDDIO|VREF|VREF[PN]|USB_D[MP]|USBDM|USBDP|BOOT0|PMODE|MCLR|ICSPDAT|ICSPCLK)\b/i;

const LOGIC_74_RE =
  /(^|[^A-Z0-9])74(HC|HCT|LS|ALS|AC|ACT|LV|LVC|AHCT|CBT|CBTLV|AUC|AXC|AUP)\d/i;
const ANALOG_RE =
  /\b(LM358|TL07[12]|TL08[12]|OPA\d|OPAMP|NE5532|LM324|LM741|ECC83|12AX7|12AU7|VCA810|ICL7660)/i;
const PMIC_RE = /\b(TPS\d|BQ\d|nPM\d|AP2112|78L?\d{2}|LT1373|AMS1117|NCP718|AP226)/i;
const MODULE_RE =
  /ComputeModule|\bCM5\b|Jetson|Thor-AGX|Raspberry.?Pi|RP2040|RP2350|SC0914|PIC1[268]|PIC32|nRF52\d|nRF54[LH]|ESP32|ESP8266|MCF52|XCZU|ZYNQ|XC4\d{3}|XC7|XCR3/i;
const HUB_RE = /\b(USB.?HUB|XR224|USB251|USB2422|USB7\d{3}|TUSB2|GL850|FE1\.1)\b/i;
const GAUGE_RE = /\b(BM15|MAX1704|BQ27|LC709)\b/i;
const LEVEL_RE = /TXB\d|TXS\d|TXU\d|NTS01|LevelShifter|LevelTranslator/i;
const MEMORY_RE = /\b(24C\w*|24LC|AT24|W25Q|SST26|EEPROM|SRAM|628128|IS62)\b/i;
const UART_BRIDGE_RE = /\b(WK2132|SC16IS|FT232|CP210|CH340)\b/i;
const PASSIVE_REF_RE = /^(R|C|L|D|FB|F|BEAD|RN|RP|Jumper|JP|SW)\d/i;

const TEST_POINT_RE = /^TP/i;
const CONNECTOR_LIB_RE = /^(Connector|Conn_|Connector_Generic)/i;
const CONNECTOR_REF_RE = /^J\d|^P\d|^X\d|^CON/i;
const POWER_RAIL_RE = /^(VCC|VDD|VSS|GND|V?\d+V\d*|VBAT|VBUS|\+\d)/i;

function isPowerRailNet(net: SnapshotNet): boolean {
  if (net.class === "power" || net.class === "ground") return true;
  return POWER_RAIL_RE.test(net.name);
}

function isTestPoint(c: SnapshotComponent): boolean {
  return TEST_POINT_RE.test(c.refdes);
}

function isConnectorCandidate(c: SnapshotComponent): boolean {
  const lib = c.libId ?? "";
  if (CONNECTOR_LIB_RE.test(lib)) return true;
  if (CONNECTOR_REF_RE.test(c.refdes) && pinCount(c) >= 2) return true;
  return false;
}
const POWER_FLAG_REF_RE = /^#PWR|^#FLG|^#E|^#U/i;
const CRYSTAL_REF_RE = /^(Y|X|OSC)\d/i;
const CAP_REF_RE = /^C\d/i;

export interface McuScore {
  refdes: string;
  boardKey?: string;
  identity: string | null;
  pinCount: number;
  score: number;
  parts: Record<string, number>;
}

export interface McuDetectionCache {
  threshold: number;
  candidates: McuScore[];
}

function pinCount(c: SnapshotComponent): number {
  return c.pins?.length ?? 0;
}

function partBlob(c: SnapshotComponent): string {
  return [c.mpn, c.value, c.libId, c.footprint].filter(Boolean).join(" ");
}

function compKey(c: SnapshotComponent): string {
  return `${c.boardKey ?? ""}\0${c.refdes}`;
}

export function mcuIdentityLabel(c: SnapshotComponent): string | null {
  const libPart = c.libId?.split(":").pop()?.trim() || "";
  const mpn = (c.mpn ?? "").trim();
  const value = (c.value ?? "").trim();
  const generic = /_PINS$|^CONN_|DIP_x\d/i;
  const sku = /^[\d][\d./-]*$/;
  const pick = () => {
    if (mpn && !sku.test(mpn) && !generic.test(mpn)) return mpn;
    if (value && !generic.test(value) && !sku.test(value)) return value;
    if (libPart && !generic.test(libPart)) return libPart;
    return mpn || value || libPart;
  };
  const raw = pick();
  if (!raw) return null;
  return (
    raw
      .replace(/\([^)]*\)\s*$/, "")
      .replace(/-(N)\d+$/i, "-$1")
      .trim() || raw
  );
}

function isLogic74(c: SnapshotComponent): boolean {
  return LOGIC_74_RE.test(partBlob(c));
}

function isAnalogIc(c: SnapshotComponent): boolean {
  return ANALOG_RE.test(partBlob(c));
}

function isPmic(c: SnapshotComponent): boolean {
  return PMIC_RE.test(partBlob(c));
}

function isCrystal(c: SnapshotComponent): boolean {
  if (CRYSTAL_REF_RE.test(c.refdes)) return true;
  return /Crystal|Resonator|Oscillator/i.test(partBlob(c));
}

function isDebugConnector(c: SnapshotComponent): boolean {
  if (!isConnectorCandidate(c)) return false;
  return /SWD|JTAG|DEBUG|ICSP|ARM_CORTEX|TC2030|TAG-CONNECT|TAGCONNECT/i.test(
    partBlob(c) + c.refdes,
  );
}

function hasMcuFunction(c: SnapshotComponent): number {
  let n = 0;
  for (const p of c.pins ?? []) {
    if (MCU_PIN_FN_RE.test(p.name) || MCU_PIN_FN_RE.test(p.net)) n += 1;
  }
  return n;
}

function parseCapFarads(value: string): number | null {
  const v = value.trim().replace(/\s+/g, "");
  const m = v.match(/^([0-9]+(?:[.,][0-9]+)?)([pnuµmk]?F?)$/i);
  if (!m) return null;
  const mag = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(mag)) return null;
  const u = (m[2] ?? "").toLowerCase();
  if (u.startsWith("p")) return mag * 1e-12;
  if (u.startsWith("n")) return mag * 1e-9;
  if (u.startsWith("u") || u.startsWith("µ")) return mag * 1e-6;
  if (u.startsWith("k")) return mag * 1e-3;
  if (u.startsWith("m")) return mag * 1e-3;
  if (u === "f" || u === "") {
    if (mag > 1) return mag * 1e-12;
    return mag * 1e-6;
  }
  return null;
}

function isSmallDecouplingCap(c: SnapshotComponent): boolean {
  if (!CAP_REF_RE.test(c.refdes) && !/^C_/i.test(c.libId ?? "")) return false;
  const f = parseCapFarads(c.value);
  if (f == null) return /100n|0\.1u|1u|10n|10u|4\.7u|22n/i.test(c.value);
  return f >= 1e-10 && f <= 2.2e-5;
}

function skipComponent(c: SnapshotComponent): boolean {
  if (POWER_FLAG_REF_RE.test(c.refdes) || PASSIVE_REF_RE.test(c.refdes)) return true;
  if (isTestPoint(c) || isConnectorCandidate(c)) return true;
  if (/^BUS\d/i.test(c.refdes) || /^MCU_PORT/i.test(c.refdes)) return true;
  const lib = c.libId ?? "";
  if (/^(Device|power|Mechanical|LED|Jumper):/i.test(lib)) return true;
  if (/Mech_/i.test(partBlob(c))) return true;
  if (isCrystal(c) || /\d(\.\d+)?\s*(khz|mhz)\b/i.test(partBlob(c))) return true;
  if (isAnalogIc(c) || isLogic74(c)) return true;
  if (LEVEL_RE.test(partBlob(c))) return true;
  if (MEMORY_RE.test(partBlob(c))) return true;
  if (UART_BRIDGE_RE.test(partBlob(c))) return true;
  if (GAUGE_RE.test(partBlob(c))) return true;
  if (isPmic(c) && !MODULE_RE.test(partBlob(c))) return true;
  if (/CONN_/i.test(c.value) || /CONN_/i.test(c.footprint)) return true;
  return false;
}

function uniqueIcs(snapshot: DesignSnapshot): SnapshotComponent[] {
  const groups = new Map<string, SnapshotComponent[]>();
  for (const c of snapshot.components) {
    if (skipComponent(c)) continue;
    const k = compKey(c);
    const list = groups.get(k) ?? [];
    list.push(c);
    groups.set(k, list);
  }
  const out: SnapshotComponent[] = [];
  for (const [, units] of groups) {
    const byNumber = new Map<string, NonNullable<SnapshotComponent["pins"]>[number]>();
    let best = units[0]!;
    for (const u of units) {
      if (pinCount(u) > pinCount(best)) best = u;
      for (const p of u.pins ?? []) {
        const prev = byNumber.get(p.number);
        if (!prev) byNumber.set(p.number, { ...p });
        else if (!prev.net && p.net) byNumber.set(p.number, { ...p });
      }
    }
    out.push({
      ...best,
      pins: [...byNumber.values()].sort((a, b) =>
        a.number.localeCompare(b.number, undefined, { numeric: true }),
      ),
    });
  }
  return out;
}

function nodeRef(node: string): string | null {
  const i = node.lastIndexOf(".");
  if (i <= 0) return null;
  return node.slice(0, i);
}

function buildHopGraph(snapshot: DesignSnapshot): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (a === b) return;
    let s = adj.get(a);
    if (!s) {
      s = new Set();
      adj.set(a, s);
    }
    s.add(b);
  };
  for (const net of snapshot.nets) {
    if (isPowerRailNet(net)) continue;
    const refs = new Set<string>();
    for (const node of net.nodes) {
      const r = nodeRef(node);
      if (r) refs.add(`${net.boardKey ?? ""}\0${r}`);
    }
    const list = [...refs];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        add(list[i]!, list[j]!);
        add(list[j]!, list[i]!);
      }
    }
  }
  return adj;
}

function distancesFrom(
  seeds: Set<string>,
  adj: Map<string, Set<string>>,
): Map<string, number> {
  const dist = new Map<string, number>();
  const frontier: string[] = [];
  for (const s of seeds) {
    dist.set(s, 0);
    frontier.push(s);
  }
  for (let i = 0; i < frontier.length; i++) {
    const k = frontier[i]!;
    const d = dist.get(k)!;
    if (d >= 2) continue;
    for (const n of adj.get(k) ?? []) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      frontier.push(n);
    }
  }
  return dist;
}

function pinTerm(pins: number): number {
  if (pins <= 8) return 0;
  if (pins <= 20) return 0.12 * ((pins - 8) / 12);
  if (pins <= 40) return 0.2;
  if (pins <= 80) return 0.28;
  return 0.34;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function indexNetsByComp(snapshot: DesignSnapshot): Map<string, SnapshotNet[]> {
  const m = new Map<string, SnapshotNet[]>();
  for (const net of snapshot.nets) {
    const seen = new Set<string>();
    for (const node of net.nodes) {
      const r = nodeRef(node);
      if (!r) continue;
      const k = `${net.boardKey ?? ""}\0${r}`;
      if (seen.has(k)) continue;
      seen.add(k);
      let arr = m.get(k);
      if (!arr) {
        arr = [];
        m.set(k, arr);
      }
      arr.push(net);
    }
  }
  return m;
}

export function scoreMcuCandidates(snapshot: DesignSnapshot): McuScore[] {
  const ics = uniqueIcs(snapshot);
  const adj = buildHopGraph(snapshot);
  const netsByComp = indexNetsByComp(snapshot);

  const crystalKeys = new Set<string>();
  const debugKeys = new Set<string>();
  const connKeys = new Set<string>();
  for (const c of snapshot.components) {
    const k = compKey(c);
    if (isCrystal(c)) crystalKeys.add(k);
    if (isConnectorCandidate(c)) {
      connKeys.add(k);
      if (isDebugConnector(c) || hasMcuFunction(c) > 0) debugKeys.add(k);
    }
  }
  const xtalDist = distancesFrom(crystalKeys, adj);
  const debugDist = distancesFrom(debugKeys, adj);
  const connDist = distancesFrom(connKeys, adj);

  const capOnPower = new Map<string, number>();
  for (const cap of snapshot.components) {
    if (!isSmallDecouplingCap(cap)) continue;
    for (const n of netsByComp.get(compKey(cap)) ?? []) {
      if (!isPowerRailNet(n)) continue;
      const pk = `${n.boardKey ?? ""}\0${n.name}`;
      capOnPower.set(pk, (capOnPower.get(pk) ?? 0) + 1);
    }
  }

  const scores: McuScore[] = [];
  for (const c of ics) {
    const pins = pinCount(c);
    const ident = mcuIdentityLabel(c);
    const blob = partBlob(c);
    const moduleHit = MODULE_RE.test(blob);
    const known = matchesMcuIdentity(c) || moduleHit;
    if (pins < 8 && !known) continue;

    const nets = netsByComp.get(compKey(c)) ?? [];
    const powerNets = nets.filter((n) => isPowerRailNet(n));
    const rails = new Set(powerNets.map((n) => n.name)).size;
    const fnHits = hasMcuFunction(c);
    let smallC = 0;
    for (const n of powerNets) {
      smallC += capOnPower.get(`${n.boardKey ?? ""}\0${n.name}`) ?? 0;
    }

    const key = compKey(c);
    const xtalH = xtalDist.get(key);
    const debugH = debugDist.get(key);
    const connH = connDist.get(key);

    const parts: Record<string, number> = {
      pins: pinTerm(pins),
      functions: Math.min(0.24, fnHits * 0.08),
      rails: Math.min(0.16, rails * 0.05),
      decouple: Math.min(0.12, (smallC / Math.max(pins, 1)) * 1.8),
      xtal: xtalH != null && xtalH <= 2 ? 0.14 : 0,
      debug: debugH != null && debugH <= 2 ? 0.12 : 0,
      connector: connH != null && connH <= 2 ? 0.08 : 0,
      identity: moduleHit ? 0.55 : known ? 0.38 : 0,
      analog: isAnalogIc(c) ? -0.5 : 0,
      logic: isLogic74(c) ? -0.45 : 0,
      pmic: isPmic(c) ? -0.28 : 0,
      hub: HUB_RE.test(blob) ? -0.4 : 0,
      gauge: GAUGE_RE.test(blob) ? -0.35 : 0,
    };
    const score = Math.round(clamp01(
      parts.pins +
        parts.functions +
        parts.rails +
        parts.decouple +
        parts.xtal +
        parts.debug +
        parts.connector +
        parts.identity +
        parts.analog +
        parts.logic +
        parts.pmic +
        parts.hub +
        parts.gauge,
    ) * 1e6) / 1e6;
    scores.push({
      refdes: c.refdes,
      boardKey: c.boardKey,
      identity: ident,
      pinCount: pins,
      score,
      parts,
    });
  }
  scores.sort((a, b) => b.score - a.score || b.pinCount - a.pinCount);
  return scores;
}

export function attachMcuDetection(snapshot: DesignSnapshot): DesignSnapshot {
  if (snapshot.mcuDetection) return snapshot;
  snapshot.mcuDetection = {
    threshold: MCU_SCORE_THRESHOLD,
    candidates: scoreMcuCandidates(snapshot),
  };
  return snapshot;
}

export function emittedMcusFromCache(snapshot: DesignSnapshot): BscMcu[] {
  attachMcuDetection(snapshot);
  const cache = snapshot.mcuDetection!;
  const byKey = new Map<string, SnapshotComponent>();
  for (const c of snapshot.components) {
    const k = compKey(c);
    const prev = byKey.get(k);
    if (!prev || pinCount(c) > pinCount(prev)) byKey.set(k, c);
  }
  const eligible = cache.candidates.filter(
    (cand) => cand.score >= cache.threshold && cand.pinCount > 0,
  );
  const identityNoPins = cache.candidates.find(
    (cand) =>
      cand.score >= cache.threshold &&
      (cand.parts.identity ?? 0) > 0 &&
      cand.pinCount === 0,
  );
  if (identityNoPins && !eligible.some((c) => (c.parts.identity ?? 0) > 0)) {
    return [];
  }
  const withFamily = eligible.filter((cand) => (cand.parts.identity ?? 0) > 0);
  const hubOnly = eligible.filter((cand) => (cand.parts.hub ?? 0) < 0);
  const ranked = (withFamily.length ? withFamily : eligible.length ? eligible : hubOnly).slice(
    0,
    3,
  );
  const out: BscMcu[] = [];
  for (const cand of ranked) {
    const c = byKey.get(`${cand.boardKey ?? ""}\0${cand.refdes}`);
    if (!c) continue;
    const notes: ConfidenceNote[] = [
      {
        field: "confidence",
        reason: `Computed score ${cand.score.toFixed(3)} from pins=${cand.pinCount} identity=${cand.parts.identity} rails=${cand.parts.rails} functions=${cand.parts.functions}`,
      },
    ];
    const mpn = cand.identity;
    if (!c.mpn) {
      notes.push({
        field: "mpn",
        reason: c.value
          ? "Using Value field; dedicated MPN property absent"
          : "No MPN or Value on symbol",
      });
    }
    const pkg = c.footprint || null;
    if (!pkg) {
      notes.push({
        field: "package",
        reason: "Footprint empty on symbol",
      });
    }
    out.push({
      refdes: c.refdes,
      boardKey: cand.boardKey,
      mpn: mpn || null,
      package: pkg,
      confidence: cand.score,
      confidenceNotes: notes,
    });
  }
  return out.sort((a, b) => a.refdes.localeCompare(b.refdes, undefined, { numeric: true }));
}
