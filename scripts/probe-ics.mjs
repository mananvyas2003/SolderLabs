import path from "node:path";
import { parseKicadProjectDir } from "../workers/parser/src/index.ts";
import { isConnectorCandidate, isTestPoint } from "../packages/bsc/src/rules.ts";

function dump(board) {
  const snap = parseKicadProjectDir(path.join("fixtures/kicad-source-mirror/demos", board));
  const map = new Map();
  for (const c of snap.components) {
    if (c.refdes.startsWith("#")) continue;
    if (isConnectorCandidate(c) || isTestPoint(c)) continue;
    if (/^(R|C|L|D|FB|F|TP|J|P|SW|K|Y|X|FID|MH|H)\d/i.test(c.refdes)) continue;
    const pc = c.pins?.length ?? 0;
    const id = `${c.refdes}|${c.value}|${c.libId}|${c.mpn ?? ""}`;
    const prev = map.get(id);
    if (!prev || pc > prev.pins) map.set(id, { refdes: c.refdes, pins: pc, value: c.value, libId: c.libId, mpn: c.mpn });
  }
  const rows = [...map.values()].sort((a, b) => b.pins - a.pins);
  console.log("\n==", board, "ics", rows.length);
  console.log(JSON.stringify(rows.slice(0, 15), null, 2));
}

for (const b of ["pic_programmer", "sonde xilinx", "complex_hierarchy", "multichannel", "simulation", "royalblue54L_feather"]) {
  dump(b);
}
