import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKicadProjectDir } from "../workers/parser/src/index.ts";
import { diffSnapshots } from "../packages/design-core/src/index.ts";
import { generateBSC, isPowerRailNet, parseNominalVolts } from "../packages/bsc/src/index.ts";
import { paginateDiff } from "../apps/web/src/lib/paginate-diff.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demos = path.join(root, "fixtures/kicad-source-mirror/demos");

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

console.log("=== A1 pic_programmer + sibling board ===");
const pic = path.join(demos, "pic_programmer");
const kit = path.join(demos, "kit-dev-coldfire-xilinx_5213");
if (!fs.existsSync(pic) || !fs.existsSync(kit)) {
  console.log("FAIL: KiCad demos missing", { pic: fs.existsSync(pic), kit: fs.existsSync(kit) });
  process.exit(1);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-a1-"));
const r1 = path.join(tmp, "r1");
const r2 = path.join(tmp, "r2");
copyDir(pic, r1);
copyDir(pic, r2);
copyDir(kit, path.join(r2, "extra-board"));
const s1 = parseKicadProjectDir(r1);
const s2 = parseKicadProjectDir(r2);
const d = diffSnapshots(s1, s2, { baseRevisionId: "r1", headRevisionId: "r2" });
const a1 = {
  boardsAdded: d.summary.boardsAdded,
  boardsRemoved: d.summary.boardsRemoved,
  componentsAdded: d.summary.componentsAdded,
  componentsRemoved: d.summary.componentsRemoved,
  componentsChanged: d.summary.componentsChanged,
  significantElectrical: d.summary.significantElectrical,
  electricalGate: d.summary.electricalGate,
  r1Components: s1.components.length,
  r2Components: s2.components.length,
  r1SheetIds: [...new Set(s1.components.map((c) => c.sheetId))].slice(0, 8),
  r2PicSheetIds: [
    ...new Set(
      s2.components
        .filter((c) => (c.boardKey ?? "").includes("pic_programmer"))
        .map((c) => c.sheetId),
    ),
  ].slice(0, 8),
};
console.log(JSON.stringify({ summary: d.summary, ...a1 }, null, 2));
if (
  a1.boardsAdded !== 1 ||
  a1.componentsAdded !== 0 ||
  a1.componentsRemoved !== 0 ||
  a1.componentsChanged !== 0
) {
  console.log("A1 FAILED vs required boardsAdded:1 componentsAdded/Removed/Changed:0");
  process.exit(1);
}

console.log("\n=== A2 simulation rails / royalblue zero-node ===");
const sim = parseKicadProjectDir(path.join(demos, "simulation"));
const simBsc = generateBSC(sim, { boardName: "simulation" });
const simExpected = new Set(
  sim.nets
    .filter((n) => n.nodes.length && isPowerRailNet(n))
    .map((n) => `${n.boardKey ?? ""}\0${n.name}`),
);
const simRailKeys = [];
for (const r of simBsc.powerRails) {
  const net = sim.nets.find(
    (n) =>
      n.name === r.name &&
      n.nodes.length &&
      isPowerRailNet(n) &&
      !simRailKeys.includes(`${n.boardKey ?? ""}\0${n.name}`),
  );
  simRailKeys.push(`${net?.boardKey ?? ""}\0${r.name}`);
}
const simDup = simRailKeys.filter((k, i) => simRailKeys.indexOf(k) !== i);
console.log(
  JSON.stringify(
    {
      simulationRailCount: simBsc.powerRails.length,
      uniqueBoardKeyNameNets: simExpected.size,
      simulationRails: simBsc.powerRails.map((r) => ({
        name: r.name,
        nominalVolts: r.nominalVolts,
      })),
      duplicateBoardKeyName: [...new Set(simDup)],
      simulationZeroNodeNets: sim.nets.filter((n) => n.nodes.length === 0).map((n) => n.name),
    },
    null,
    2,
  ),
);

const rb = parseKicadProjectDir(path.join(demos, "royalblue54L_feather"));
const rbBsc = generateBSC(rb, { boardName: "royalblue54L_feather" });
const rbZero = rb.nets.filter((n) => n.nodes.length === 0).map((n) => n.name);
const rbRailsZero = rbBsc.powerRails.filter((r) => {
  const net = rb.nets.find((n) => n.name === r.name);
  return !net || net.nodes.length === 0;
});
console.log(
  JSON.stringify(
    {
      royalblueRails: rbBsc.powerRails.map((r) => ({
        name: r.name,
        nominalVolts: r.nominalVolts,
        nodes: rb.nets.find((n) => n.name === r.name)?.nodes.length ?? null,
      })),
      royalblueZeroNodeNets: rbZero,
      railsWithZeroNodes: rbRailsZero.map((r) => r.name),
    },
    null,
    2,
  ),
);
if (simDup.length || simBsc.powerRails.length !== simExpected.size || rbRailsZero.length || rbZero.length) {
  console.log("A2 FAILED", {
    simDup: simDup.length,
    railVsNet: `${simBsc.powerRails.length} vs ${simExpected.size}`,
    rbRailsZero: rbRailsZero.length,
    rbZero: rbZero.length,
  });
  process.exit(1);
}

console.log("\n=== A3 voltage table ===");
const cases = ["-5V", "PWR_3,3-5V", "Vpil_0_3,3V", "+3,3V_OUT"];
const a3 = Object.fromEntries(
  cases.map((n) => {
    const r = parseNominalVolts(n);
    return [n, { volts: r.volts, note: r.note?.reason ?? null }];
  }),
);
console.log(JSON.stringify(a3, null, 2));
if (
  a3["-5V"].volts !== -5 ||
  a3["PWR_3,3-5V"].volts !== null ||
  a3["Vpil_0_3,3V"].volts !== 3.3 ||
  a3["+3,3V_OUT"].volts !== 3.3
) {
  console.log("A3 FAILED");
  process.exit(1);
}

console.log("\n=== A4 compare payload pagination ===");
const zynqOlder = path.join(root, "fixtures/corpus/zynq-som/older");
const zynqNewer = path.join(root, "fixtures/corpus/zynq-som/newer");
if (!fs.existsSync(zynqOlder) || !fs.existsSync(zynqNewer)) {
  console.log("FAIL: zynq-som corpus missing — run npm run corpus:fetch");
  process.exit(1);
}
const z1 = parseKicadProjectDir(zynqOlder);
const z2 = parseKicadProjectDir(zynqNewer);
const zDiff = diffSnapshots(z1, z2, {
  baseRevisionId: "older",
  headRevisionId: "newer",
});
const paged = paginateDiff(zDiff, {
  limit: 200,
  componentsOffset: 0,
  netsOffset: 0,
  electricalOffset: 0,
  pcbOffset: 0,
});
const bytes = Buffer.byteLength(JSON.stringify(paged), "utf8");
const kb = bytes / 1024;
console.log(
  JSON.stringify(
    {
      componentCounts: { older: z1.components.length, newer: z2.components.length },
      kb: Number(kb.toFixed(1)),
      page: paged.page,
      hasPcbBase: "pcbBase" in paged,
      hasPcbHead: "pcbHead" in paged,
    },
    null,
    2,
  ),
);
if (kb >= 200) {
  console.log("A4 FAILED: payload not under 200 KB");
  process.exit(1);
}

console.log("\nA1–A4 passed");
