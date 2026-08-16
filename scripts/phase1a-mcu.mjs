/**
 * Phase 1a MCU detection acceptance against official KiCad demo boards.
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
const noMcu = new Set(["ecc83", "microwave", "constraints"]);

const boards = fs
  .readdirSync(demos)
  .filter((n) => fs.statSync(path.join(demos, n)).isDirectory())
  .sort();

console.log(`\n=== B1 MCU table (${boards.length} boards) threshold=${MCU_SCORE_THRESHOLD} ===`);
console.log("board\tmcu refdes\tidentity\tpin count\tconfidence");

let withMcu = 0;
const b2 = {};
const b3 = {};
const b4 = {};

for (const name of boards) {
  const p = path.join(demos, name);
  let snap;
  try {
    snap = parseKicadProjectDir(p);
  } catch (e) {
    console.log(`${name}\tPARSE_FAIL\t${e instanceof Error ? e.message : e}\t\t`);
    continue;
  }
  const bsc = generateBSC(snap, { boardName: name });
  if (!bsc.mcus.length) {
    const note = bsc.confidenceNotes.find((n) => n.field === "mcus")?.reason ?? "";
    console.log(`${name}\t(none)\t\t\t\t${JSON.stringify(note)}`);
    if (noMcu.has(name)) b3[name] = { empty: true, note };
    continue;
  }
  withMcu += 1;
  for (const m of bsc.mcus) {
    const pinCount = bsc.pins.filter((p) => p.mcuRefdes === m.refdes).length;
    console.log(
      `${name}\t${m.refdes}\t${m.mpn ?? ""}\t${pinCount}\t${m.confidence}`,
    );
  }
  if (expectedB2[name]) {
    b2[name] = bsc.mcus.map((m) => m.mpn);
  }
  if (name === "cm5_minima" || name === "jetson-agx-thor-baseboard") {
    b4[name] = bsc.pins.length;
  }
}

console.log(`\nBoards with MCU: ${withMcu} / ${boards.length}`);
console.log("\n=== B2 identities ===");
for (const [board, want] of Object.entries(expectedB2)) {
  const got = b2[board] ?? [];
  console.log(`${board}\twant ${want}\tgot ${JSON.stringify(got)}\t${got.includes(want) ? "OK" : "FAIL"}`);
}

console.log("\n=== B3 no-MCU boards ===");
for (const n of noMcu) {
  console.log(`${n}\t${JSON.stringify(b3[n] ?? "NOT EMPTY / MISSING")}`);
}

console.log("\n=== B4 pin counts ===");
console.log(JSON.stringify(b4, null, 2));

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
