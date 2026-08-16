import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKicadSchematicText, parseKicadProjectDir } from "./index.ts";
import {
  classifyNet,
  expandBusMembers,
  normalizeNetName,
  resolveConnectivity,
} from "./connectivity.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/kicad/blinky",
);

test("parse r1 resolves pin nets from wires", () => {
  const src = fs.readFileSync(path.join(root, "r1/blinky.kicad_sch"), "utf8");
  const snap = parseKicadSchematicText(src);
  assert.ok(snap.components.length >= 4);
  const u1 = snap.components.find((c) => c.refdes === "U1");
  assert.ok(u1?.pins?.length);
  const vdd = snap.nets.find((n) => n.name === "VDD");
  assert.ok(vdd);
  assert.ok(vdd!.nodes.includes("C12.1") || vdd!.nodes.includes("R1.1"));
  const gnd = snap.nets.find((n) => n.name === "GND");
  assert.ok(gnd?.nodes.length);
});

test("r1 vs r2 semantic rename LED_DRIVE → LED_ANODE", async () => {
  const { semanticDiff } = await import("@solderlab/design-core");
  const a = parseKicadProjectDir(path.join(root, "r1"));
  const b = parseKicadProjectDir(path.join(root, "r2"));
  const d = semanticDiff(a, b);
  assert.ok(
    d.changes.some(
      (c) =>
        c.type === "NetRenamed" &&
        c.beforeName === "LED_DRIVE" &&
        c.afterName === "LED_ANODE",
    ),
    `expected rename, got ${d.changes.map((c) => c.message).join("; ")}`,
  );
  assert.ok(d.changes.some((c) => c.refdes === "C13" || c.message.includes("C13")));
});

test("normalizeNetName unescapes slash and strips overbar", () => {
  assert.equal(normalizeNetName("VPP{slash}MCLR"), "VPP/MCLR");
  assert.equal(normalizeNetName("~{RESET}"), "RESET");
});

test("expandBusMembers expands range and list buses", () => {
  assert.deepEqual(expandBusMembers("ANALOG{A[0..5]}"), [
    "ANALOG{A0}",
    "ANALOG{A1}",
    "ANALOG{A2}",
    "ANALOG{A3}",
    "ANALOG{A4}",
    "ANALOG{A5}",
  ]);
  assert.deepEqual(expandBusMembers("USB{VBUS, CC1, CC2}"), [
    "USB{VBUS}",
    "USB{CC1}",
    "USB{CC2}",
  ]);
});

test("classifyNet uses token boundaries and power-symbol identity", () => {
  assert.equal(classifyNet("nRF52_VDD"), "power");
  assert.equal(classifyNet("AVDD"), "power");
  assert.equal(classifyNet("MCU_VDD"), "power");
  assert.equal(classifyNet("DDR_VDDQ"), "power");
  assert.equal(classifyNet("DATA"), "signal");
  assert.equal(
    classifyNet("EARTH", { libId: "power:GND", value: "GND" }),
    "ground",
  );
});

test("#PWR symbols join a global net named by Value", () => {
  const symbols = Array.from({ length: 41 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    const x = (i % 10) * 5;
    const y = Math.floor(i / 10) * 5;
    return `
		(symbol
			(lib_id "power:GND")
			(at ${x} ${y} 0)
			(unit 1)
			(uuid "00000000-0000-0000-0000-0000000000${n}")
			(property "Reference" "#PWR${n}" (at ${x} ${y} 0) (effects (font (size 1.27 1.27))))
			(property "Value" "GND" (at ${x} ${y} 0) (effects (font (size 1.27 1.27))))
		)`;
  }).join("\n");
  const src = `(kicad_sch (version 20231120) (generator solderlab_test)
	(uuid "00000000-0000-0000-0000-000000000099")
${symbols}
)`;
  const snap = parseKicadSchematicText(src);
  const pwr = snap.components.filter((c) => c.refdes.startsWith("#PWR"));
  assert.equal(pwr.length, 41);
  const gnd = snap.nets.find((n) => n.name === "GND");
  assert.ok(gnd, "expected a GND net from power flags");
  assert.ok(
    gnd!.nodes.length >= 41,
    `GND nodes=${gnd!.nodes.length}, expected ≥41`,
  );
  assert.equal(gnd!.class, "ground");
});

test("VPP{slash}MCLR and VPP/MCLR collapse to one net", () => {
  const src = `(kicad_sch (version 20231120)
	(uuid "00000000-0000-0000-0000-000000000010")
	(label "VPP{slash}MCLR" (at 0 0 0) (effects (font (size 1.27 1.27))))
	(label "VPP/MCLR" (at 0 0 0) (effects (font (size 1.27 1.27))))
	(symbol (lib_id "Device:R") (at 0 3.81 0) (unit 1)
		(uuid "00000000-0000-0000-0000-000000000011")
		(property "Reference" "R1" (at 0 3.81 0) (effects (font (size 1.27 1.27))))
		(property "Value" "10k" (at 0 3.81 0) (effects (font (size 1.27 1.27))))
	)
)`;
  const { nets } = resolveConnectivity(src, [
    {
      refdes: "R1",
      value: "10k",
      footprint: "",
      sheetId: "root",
      libId: "Device:R",
      x: 0,
      y: 3.81,
      rotation: 0,
    },
  ]);
  const hits = nets.filter(
    (n) => n.name === "VPP/MCLR" || n.name.includes("VPP"),
  );
  assert.equal(
    hits.filter((n) => n.name === "VPP/MCLR").length,
    1,
    `got ${hits.map((n) => n.name).join(",")}`,
  );
});

test("bus vector labels without pins do not emit phantom member nets", () => {
  const src = `(kicad_sch (version 20231120)
	(uuid "00000000-0000-0000-0000-000000000020")
	(global_label "ANALOG{A[0..5]}" (at 1 1 0) (shape input)
		(effects (font (size 1.27 1.27))))
	(global_label "USB{VBUS, CC1, CC2}" (at 2 2 0) (shape input)
		(effects (font (size 1.27 1.27))))
)`;
  const { nets } = resolveConnectivity(src, []);
  assert.equal(nets.filter((n) => n.name.startsWith("ANALOG")).length, 0);
  assert.equal(nets.filter((n) => n.name.startsWith("USB")).length, 0);
});

test("T-junction: pin on a wire midpoint joins the net", () => {
  const src = `(kicad_sch (version 20231120)
	(uuid "00000000-0000-0000-0000-000000000030")
	(wire (pts (xy 0 0) (xy 20 0)))
	(wire (pts (xy 10 0) (xy 10 10)))
	(label "GND" (at 0 0 0)
		(effects (font (size 1.27 1.27))))
	(symbol (lib_id "Device:R") (at 10 3.81 0) (unit 1)
		(uuid "00000000-0000-0000-0000-000000000031")
		(property "Reference" "R9" (at 10 3.81 0) (effects (font (size 1.27 1.27))))
		(property "Value" "10k" (at 10 3.81 0) (effects (font (size 1.27 1.27))))
	)
)`;
  const { nets } = resolveConnectivity(src, [
    {
      refdes: "R9",
      value: "10k",
      footprint: "",
      sheetId: "root",
      libId: "Device:R",
      x: 10,
      y: 3.81,
      rotation: 0,
    },
  ]);
  const gnd = nets.find((n) => n.name === "GND");
  assert.ok(gnd?.nodes.some((n) => n.startsWith("R9.")), `GND nodes=${gnd?.nodes.join(",")}`);
});

test("PCB-only project emits empty nets with a warning", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-pcb-"));
  fs.writeFileSync(
    path.join(dir, "board.kicad_pcb"),
    "(kicad_pcb (version 20231120)\n)\n",
  );
  const snap = parseKicadProjectDir(dir);
  assert.equal(snap.components.length, 0);
  assert.equal(snap.nets.length, 0);
  assert.ok(snap.warnings?.some((w) => w.code === "pcb-only"));
});

test("lookupLibPins merges unit-0 shared pins and body style _0", async () => {
  const { lookupLibPins, extractLibSymbolsPins } = await import("./connectivity.ts");
  const src = `
(kicad_sch
  (lib_symbols
    (symbol "Vendor:WeirdIC"
      (symbol "WeirdIC_0_0"
        (pin passive line (at 0 2.54 270) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
      )
      (symbol "WeirdIC_1_0"
        (pin passive line (at 0 -2.54 90) (length 2.54)
          (name "VDD" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
)
`;
  const map = extractLibSymbolsPins(src);
  const pins = lookupLibPins(map, "Vendor:WeirdIC", 1);
  assert.equal(pins?.length, 2);
  assert.ok(pins?.some((p) => p.number === "1" && p.name === "GND"));
  assert.ok(pins?.some((p) => p.number === "2" && p.name === "VDD"));
});

test("mirror y flips capacitor pin world positions onto the correct net", () => {
  const src = `
(kicad_sch
  (lib_symbols
    (symbol "Device:C_Small"
      (symbol "C_Small_1_1"
        (pin passive line (at 0 2.54 270) (length 2.032)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.27 1.27))))
        )
        (pin passive line (at 0 -2.54 90) (length 2.032)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.27 1.27))))
        )
      )
    )
  )
  (wire (pts (xy 0 2.54) (xy 5 2.54)))
  (wire (pts (xy 0 -2.54) (xy 5 -2.54)))
  (symbol (lib_id "Device:C_Small") (at 0 0 0) (unit 1) (mirror y)
    (property "Reference" "C9" (at 0 0 0))
    (property "Value" "100n" (at 0 0 0))
  )
  (symbol (lib_id "power:GND") (at 5 2.54 0) (unit 1)
    (property "Reference" "#PWR1" (at 5 2.54 0))
    (property "Value" "GND" (at 5 2.54 0))
  )
  (symbol (lib_id "power:VDD") (at 5 -2.54 0) (unit 1)
    (property "Reference" "#PWR2" (at 5 -2.54 0))
    (property "Value" "VDD" (at 5 -2.54 0))
  )
)
`;
  // Without mirror, pin1 is at +y (GND). With mirror y on a vertical pin pair,
  // X flips are no-ops; use mirror x so pin1 (+y) maps to -y (VDD side).
  const srcX = src.replace("(mirror y)", "(mirror x)");
  const snap = parseKicadSchematicText(srcX);
  const c9 = snap.components.find((c) => c.refdes === "C9");
  assert.equal(c9?.mirror, "x");
  const p1 = c9?.pins?.find((p) => p.number === "1");
  const p2 = c9?.pins?.find((p) => p.number === "2");
  assert.equal(p1?.net, "VDD", `pin1 net=${p1?.net}`);
  assert.equal(p2?.net, "GND", `pin2 net=${p2?.net}`);
});

test("sheetId is namespaced with board key on single- and multi-board paths", () => {
  const sch = fs.readFileSync(path.join(root, "r1/blinky.kicad_sch"), "utf8");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-sheetid-"));
  const boardA = path.join(dir, "pic_programmer");
  const boardB = path.join(dir, "other");
  fs.mkdirSync(boardA);
  fs.mkdirSync(boardB);
  fs.writeFileSync(path.join(boardA, "pic_programmer.kicad_sch"), sch);
  fs.writeFileSync(path.join(boardA, "pic_programmer.kicad_pro"), "(kicad_pro (version 1))\n");
  fs.writeFileSync(path.join(boardB, "other.kicad_sch"), sch);
  fs.writeFileSync(path.join(boardB, "other.kicad_pro"), "(kicad_pro (version 1))\n");

  const alone = parseKicadProjectDir(path.join(boardA, "pic_programmer.kicad_pro"));
  const tree = parseKicadProjectDir(dir);
  const idsAlone = [...new Set(alone.components.map((c) => c.sheetId))].sort();
  const idsTree = [
    ...new Set(
      tree.components
        .filter((c) => c.boardKey === "pic_programmer.kicad_pro")
        .map((c) => c.sheetId),
    ),
  ].sort();
  assert.ok(idsAlone.length);
  assert.deepEqual(idsAlone, idsTree);
  assert.ok(idsAlone.every((id) => id.startsWith("pic_programmer.kicad_pro:")));
});
