import fs from "node:fs";
import path from "node:path";
const { parseKicadProject } = await import(
  new URL(`file://${path.join(process.cwd(), "workers/parser/src/index.ts")}`).href
);

// --- piantor left (newer) ---
for (const [name, pro] of [
  ["piantor-left-newer", "fixtures/corpus/piantor/newer/left/keyboard_pcb.kicad_pro"],
  ["sprig", "fixtures/corpus/sprig/older/mainboard_PCB/kicad/sprig_console.kicad_pro"],
]) {
  const snap = parseKicadProject(pro);
  const gnd = snap.nets.find((n) => n.name === "GND");
  console.log(`\n=== ${name}`);
  console.log(`components=${snap.components.length} nets=${snap.nets.length}`);
  console.log(`GND nodes (${gnd?.nodes.length}):`, gnd?.nodes.join(", "));
  // per-component pin nets
  const comps = snap.components;
  const gndComps = comps.filter((c) => (c.pins ?? []).some((p) => p.net === "GND"));
  console.log(`components with a GND pin: ${gndComps.length}`);
  const pwr = comps.filter((c) => c.refdes.startsWith("#") && (c.pins ?? []).some((p) => p.net === "GND"));
  console.log(`power flags on GND: ${pwr.length}`);
  const real = gndComps.filter((c) => !c.refdes.startsWith("#"));
  console.log(`real (non-#) comps on GND: ${real.length}`);
}
