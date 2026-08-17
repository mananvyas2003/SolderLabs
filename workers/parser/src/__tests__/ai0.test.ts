import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateBSC } from "@solderlab/bsc";
import { parseKicadProjectDir } from "../index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");
const featherDir = path.join(
  repoRoot,
  "fixtures/kicad-source-mirror/demos/royalblue54L_feather",
);
const stickhubDir = path.join(
  repoRoot,
  "fixtures/kicad-source-mirror/demos/stickhub",
);
const jetsonDir = path.join(
  repoRoot,
  "fixtures/kicad-source-mirror/demos/jetson-agx-thor-baseboard",
);
const kintexDir = path.join(repoRoot, "fixtures/corpus/kintex-pcie/newer");

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

function pcbGndPads(pcbPath: string): string[] {
  const src = fs.readFileSync(pcbPath, "utf8");
  const pads: string[] = [];
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

function schGndNodes(snap: ReturnType<typeof parseKicadProjectDir>): string[] {
  const nets = snap.nets.filter(
    (n) => n.name === "GND" || n.name === "/GND" || n.class === "ground",
  );
  return [...new Set(nets.flatMap((n) => n.nodes))].sort();
}

function refdesOf(id: string): string {
  const i = id.lastIndexOf(".");
  return i > 0 ? id.slice(0, i) : id;
}

test("AI-0: Feather GND-named pins land on ground", (t) => {
  if (!fs.existsSync(featherDir)) {
    t.skip("KiCad demo royalblue54L_feather missing");
    return;
  }
  const snap = parseKicadProjectDir(featherDir);
  const wrong: string[] = [];
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
  assert.deepEqual(wrong, [], `GND-named pins on the wrong net: ${wrong.join(", ")}`);
});

test("AI-0: Feather sch vs PCB GND unique pads", (t) => {
  if (!fs.existsSync(featherDir)) {
    t.skip("KiCad demo royalblue54L_feather missing");
    return;
  }
  const pcbFile = fs.readdirSync(featherDir).find((n) => n.endsWith(".kicad_pcb"));
  assert.ok(pcbFile, "Feather .kicad_pcb missing");
  const snap = parseKicadProjectDir(featherDir);
  const sch = schGndNodes(snap).filter((id) => !id.startsWith("#PWR"));
  const pcb = pcbGndPads(path.join(featherDir, pcbFile));
  const schSet = new Set(sch);
  const pcbSet = new Set(pcb);
  let schOnly = sch.filter((id) => !pcbSet.has(id));
  let pcbOnly = pcb.filter((id) => !schSet.has(id));

  const polarity = /^(C|SW)\d/i;
  const schRefs = new Set(schOnly.filter((id) => polarity.test(refdesOf(id))).map(refdesOf));
  const pcbRefs = new Set(pcbOnly.filter((id) => polarity.test(refdesOf(id))).map(refdesOf));
  const swapped = [...schRefs].filter((r) => pcbRefs.has(r));
  schOnly = schOnly.filter((id) => !swapped.includes(refdesOf(id)));
  pcbOnly = pcbOnly.filter((id) => !swapped.includes(refdesOf(id)));

  assert.deepEqual(schOnly, [], `schematic-only GND pads: ${schOnly.join(", ")}`);
  assert.deepEqual(
    pcbOnly.sort(),
    ["Y2.2", "Y2.4"],
    `PCB-only GND pads beyond crystal extras: ${pcbOnly.join(", ")}`,
  );
});

test("AI-0: Kintex VIN pins sit on +12V", (t) => {
  if (!fs.existsSync(kintexDir)) {
    t.skip("corpus kintex-pcie/newer missing — run npm run corpus:fetch");
    return;
  }
  const snap = parseKicadProjectDir(kintexDir);
  const nodes = new Set(snap.nets.find((n) => n.name === "+12V")?.nodes ?? []);
  for (const id of ["U8.28", "U8.29", "U9.5", "U9.8", "U9.9", "U9.27"]) {
    assert.equal(nodes.has(id), true, `${id} missing from +12V`);
  }
});

test("AI-0: compute Feather emits MCU; USB hub stays empty; Jetson pins are not invented", (t) => {
  if (!fs.existsSync(featherDir) || !fs.existsSync(stickhubDir) || !fs.existsSync(jetsonDir)) {
    t.skip("KiCad demos missing");
    return;
  }
  const feather = generateBSC(parseKicadProjectDir(featherDir), {
    boardName: "royalblue54L_feather",
  });
  assert.equal(feather.mcus.some((m) => m.mpn === "nRF52833-QDXX"), true);
  assert.ok(feather.pins.length > 0, "Feather MCU pins empty");

  const hub = generateBSC(parseKicadProjectDir(stickhubDir), { boardName: "stickhub" });
  assert.equal(hub.mcus.length, 0);

  const jetson = generateBSC(parseKicadProjectDir(jetsonDir), {
    boardName: "jetson-agx-thor-baseboard",
  });
  assert.ok(jetson.mcus.length > 0, "Jetson SoM identity missing");
  assert.equal(jetson.pins.length, 0, `Jetson invented pins: ${jetson.pins.length}`);
});
