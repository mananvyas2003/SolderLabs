import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKicadSchematicText, parseKicadProjectDir } from "./index.ts";

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
