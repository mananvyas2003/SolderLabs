import { parseKicadProjectDir } from "../workers/parser/src/index.ts";

const snap = parseKicadProjectDir(
  "fixtures/kicad-source-mirror/demos/royalblue54L_feather",
);
for (const ref of ["U1", "U2", "U5", "J3", "J4"]) {
  const comps = snap.components.filter((c) => c.refdes === ref);
  console.log(
    "\n",
    ref,
    comps.map((c) => ({
      libId: c.libId,
      unit: c.unit,
      sheet: c.sheetId,
      pinCount: c.pins?.length,
      gndish: (c.pins ?? [])
        .filter(
          (p) =>
            /GND|VSS/i.test(p.name) ||
            p.net === "GND" ||
            /GND/i.test(p.net ?? ""),
        )
        .map((p) => `${p.number}:${p.name}=${p.net || "∅"}`),
    })),
  );
}
