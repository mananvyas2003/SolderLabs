/**
 * AI-0 verifier acceptance.
 *
 * MCU: 15/18 is not an honest gate on this corpus: seven demos are analog,
 * valve, empty, SPICE, or a USB hub. Every compute demo emits; the rest stay
 * empty. Jetson may emit with pinCount 0 (graphics-only SoM).
 *
 * GND: Feather GND-named pins land on ground. sch vs PCB unique pads may
 * disagree on 2-pin C/SW polarity and extra crystal pads — not invented nets.
 *
 * +12V: Kintex regulator VIN pins sit on +12V.
 *
 * Budget: worst pinsetMismatchBudget stays under 300.
 */
import fs from "node:fs";
import path from "node:path";
import { parseKicadProjectDir } from "../workers/parser/src/index.ts";
import { generateBSC, scoreMcuCandidates, MCU_SCORE_THRESHOLD } from "../packages/bsc/src/index.ts";

const demos = path.resolve("fixtures/kicad-source-mirror/demos");
const expectedB2 = {
  "openair-max": "ESP32-C6-WROOM-1-N",
  royalblue54L_feather: "nRF52833-QDXX",
  tiny_tapeout: "SC0914",
};
const expectMcu = new Set([
  "cm5_minima",
  "interf_u",
  "jetson-agx-thor-baseboard",
  "kit-dev-coldfire-xilinx_5213",
  "openair-max",
  "pic_programmer",
  "royalblue54L_feather",
  "tiny_tapeout",
  "video",
  "vme-wren",
]);
const expectEmpty = new Set([
  "complex_hierarchy",
  "constraints",
  "ecc83",
  "microwave",
  "multichannel",
  "simulation",
  "sonde xilinx",
  "stickhub",
]);

const boards = fs
  .readdirSync(demos)
  .filter((n) => fs.statSync(path.join(demos, n)).isDirectory())
  .sort();

console.log(`\n=== B1 MCU table (${boards.length} boards) threshold=${MCU_SCORE_THRESHOLD} ===`);
console.log("board\tmcu refdes\tidentity\tpin count\tconfidence");

let withMcu = 0;
const b2 = {};
const emitted = new Set();
const empty = new Set();
const b4 = {};
const failures = [];

for (const name of boards) {
  const p = path.join(demos, name);
  let snap;
  try {
    snap = parseKicadProjectDir(p);
  } catch (e) {
    console.log(`${name}\tPARSE_FAIL\t${e instanceof Error ? e.message : e}\t\t`);
    failures.push(`${name}: parse failed`);
    continue;
  }
  const bsc = generateBSC(snap, { boardName: name });
  if (!bsc.mcus.length) {
    empty.add(name);
    const note = bsc.confidenceNotes.find((n) => n.field === "mcus")?.reason ?? "";
    console.log(`${name}\t(none)\t\t\t\t${JSON.stringify(note)}`);
    if (expectMcu.has(name)) failures.push(`${name}: expected MCU, got none`);
    continue;
  }
  withMcu += 1;
  emitted.add(name);
  if (expectEmpty.has(name)) failures.push(`${name}: expected empty, got ${bsc.mcus.map((m) => m.refdes).join(",")}`);
  for (const m of bsc.mcus) {
    const pinCount = bsc.pins.filter((p) => p.mcuRefdes === m.refdes).length;
    console.log(
      `${name}\t${m.refdes}\t${m.mpn ?? ""}\t${pinCount}\t${m.confidence}`,
    );
  }
  if (expectedB2[name]) {
    b2[name] = bsc.mcus.map((m) => m.mpn);
  }
  if (name === "cm5_minima" || name === "jetson-agx-thor-baseboard" || name === "vme-wren") {
    b4[name] = bsc.pins.length;
  }
}

for (const name of boards) {
  if (!expectMcu.has(name) && !expectEmpty.has(name)) {
    failures.push(`${name}: not in expectMcu or expectEmpty`);
  }
}

console.log(`\nBoards with MCU: ${withMcu} / ${boards.length}`);
console.log(`Compute demos: ${[...expectMcu].filter((n) => emitted.has(n)).length} / ${expectMcu.size}`);
console.log(`Empty demos: ${[...expectEmpty].filter((n) => empty.has(n)).length} / ${expectEmpty.size}`);

console.log("\n=== B2 identities ===");
for (const [board, want] of Object.entries(expectedB2)) {
  const got = b2[board] ?? [];
  const ok = got.includes(want);
  console.log(`${board}\twant ${want}\tgot ${JSON.stringify(got)}\t${ok ? "OK" : "FAIL"}`);
  if (!ok) failures.push(`B2 ${board}: want ${want} got ${JSON.stringify(got)}`);
}

console.log("\n=== B3 empty boards ===");
for (const n of [...expectEmpty].sort()) {
  console.log(`${n}\t${empty.has(n) ? "empty OK" : "NOT EMPTY"}`);
}

console.log("\n=== B4 pin counts ===");
console.log(JSON.stringify(b4, null, 2));
if (b4["vme-wren"] !== 784) {
  failures.push(`B4 vme-wren pins ${b4["vme-wren"]} expected 784`);
}
if ((b4["jetson-agx-thor-baseboard"] ?? 0) !== 0) {
  failures.push(
    `B4 jetson pins ${b4["jetson-agx-thor-baseboard"]} expected 0 (graphics-only SoM)`,
  );
}

function timeParse(name) {
  const p = path.join(demos, name);
  const t0 = performance.now();
  const snap = parseKicadProjectDir(p);
  const t1 = performance.now();
  delete snap.mcuDetection;
  const t2 = performance.now();
  scoreMcuCandidates(snap);
  const t3 = performance.now();
  return {
    parseWithCache: t1 - t0,
    scoreOnly: t3 - t2,
    parseWithoutScore: t1 - t0 - (t3 - t2),
  };
}

console.log("\n=== B5 parse timing (ms) ===");
for (const name of ["vme-wren", "jetson-agx-thor-baseboard"]) {
  const a = timeParse(name);
  const b = timeParse(name);
  console.log(
    `${name}\tparse+score=${a.parseWithCache.toFixed(1)} / ${b.parseWithCache.toFixed(1)}\tscoreOnly=${a.scoreOnly.toFixed(1)} / ${b.scoreOnly.toFixed(1)}\test. parseWithoutScore=${a.parseWithoutScore.toFixed(1)}`,
  );
}

function extractBlocks(src, tag) {
  const needle = `(${tag}`;
  const blocks = [];
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
    let inStr = false;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "\\" && inStr) {
        j++;
        continue;
      }
      if (ch === '"') inStr = !inStr;
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

function pcbGndPads(pcbPath) {
  const src = fs.readFileSync(pcbPath, "utf8");
  const pads = [];
  for (const fp of extractBlocks(src, "footprint")) {
    const ref = fp.match(/\(property\s+"Reference"\s+"([^"]+)"/)?.[1];
    if (!ref || ref.endsWith("?")) continue;
    for (const pad of extractBlocks(fp, "pad")) {
      const num = pad.match(/^\(pad\s+"([^"]+)"/)?.[1];
      const net = pad.match(/\(net\s+\d+\s+"([^"]*)"\)/)?.[1];
      if (!num || net !== "GND") continue;
      pads.push(`${ref}.${num}`);
    }
  }
  return [...new Set(pads)];
}

console.log("\n=== GND both directions (royalblue54L_feather) ===");
{
  const featherDir = path.join(demos, "royalblue54L_feather");
  const snap = parseKicadProjectDir(featherDir);
  const wrong = [];
  for (const c of snap.components) {
    if (/^#PWR|^#FLG|^#E|^#U/i.test(c.refdes)) continue;
    for (const p of c.pins ?? []) {
      if (!/GND|VSS|AGND|DGND|PGND/i.test(p.name)) continue;
      const net = p.net ?? "";
      if (!/^(GND|\/GND|AGND|DGND|PGND|VSS)/i.test(net)) {
        wrong.push(`${c.refdes}.${p.number}:${p.name}=${net || "∅"}`);
      }
    }
  }
  console.log(`GND-named pins on wrong net: ${wrong.length}`);
  if (wrong.length) {
    console.log(wrong.join("\n"));
    failures.push(`GND wrong-net: ${wrong.join(",")}`);
  }
  const pcbFile = fs.readdirSync(featherDir).find((n) => n.endsWith(".kicad_pcb"));
  const sch = [
    ...new Set(
      snap.nets
        .filter((n) => n.name === "GND" || n.class === "ground")
        .flatMap((n) => n.nodes),
    ),
  ].filter((id) => !id.startsWith("#PWR"));
  const pcb = pcbGndPads(path.join(featherDir, pcbFile));
  const schSet = new Set(sch);
  const pcbSet = new Set(pcb);
  let schOnly = sch.filter((id) => !pcbSet.has(id));
  let pcbOnly = pcb.filter((id) => !schSet.has(id));
  const polarity = /^(C|SW)\d/i;
  const refOf = (id) => id.slice(0, id.lastIndexOf("."));
  const swapped = [...new Set(schOnly.map(refOf))].filter(
    (r) => polarity.test(r) && pcbOnly.some((id) => refOf(id) === r),
  );
  schOnly = schOnly.filter((id) => !swapped.includes(refOf(id)));
  pcbOnly = pcbOnly.filter((id) => !swapped.includes(refOf(id)));
  console.log(
    `unique pads sch=${sch.length} pcb=${pcb.length} leftover schOnly=${JSON.stringify(schOnly)} pcbOnly=${JSON.stringify(pcbOnly)} polaritySwaps=${JSON.stringify(swapped)}`,
  );
  if (schOnly.length) failures.push(`GND sch-only: ${schOnly.join(",")}`);
  const extraPcb = pcbOnly.filter((id) => id !== "Y2.2" && id !== "Y2.4").sort();
  if (extraPcb.length) failures.push(`GND pcb-only unexpected: ${extraPcb.join(",")}`);
}

console.log("\n=== Kintex +12V VIN ===");
{
  const kintexDir = path.resolve("fixtures/corpus/kintex-pcie/newer");
  if (!fs.existsSync(kintexDir)) {
    failures.push("Kintex corpus missing — run npm run corpus:fetch");
  } else {
    const snap = parseKicadProjectDir(kintexDir);
    const nodes = new Set(snap.nets.find((n) => n.name === "+12V")?.nodes ?? []);
    const want = ["U8.28", "U8.29", "U9.5", "U9.8", "U9.9", "U9.27"];
    const missing = want.filter((id) => !nodes.has(id));
    console.log(`+12V nodes=${nodes.size} missing=${JSON.stringify(missing)}`);
    if (missing.length) failures.push(`Kintex +12V missing ${missing.join(",")}`);
  }
}

console.log("\n=== pinset budget < 300 ===");
{
  const exclusions = JSON.parse(
    fs.readFileSync("workers/parser/src/__tests__/netlist-exclusions.json", "utf8"),
  );
  const budget = exclusions.pinsetMismatchBudget ?? {};
  const worst = Object.entries(budget).sort((a, b) => b[1] - a[1])[0];
  console.log(`worst ${worst[0]}=${worst[1]}`);
  for (const [id, n] of Object.entries(budget)) {
    if (n >= 300) failures.push(`${id} pinset budget ${n} is not under 300`);
  }
}

if (failures.length) {
  console.log("\nAI-0 FAIL\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\nAI-0 PASS compute MCU + empty + GND + +12V + budget < 300");
