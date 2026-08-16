import fs from "node:fs";
import path from "node:path";
import { parseKicadProjectDir } from "../workers/parser/src/index.ts";
import { isConnectorCandidate, isPowerRailNet, isTestPoint } from "../packages/bsc/src/rules.ts";

const demos = "fixtures/kicad-source-mirror/demos";
const FN = /SWDIO|SWCLK|SWDCLK|\bTCK\b|\bTMS\b|\bTDI\b|\bTDO\b|NRST|NRESET|\bRESET\b|\bRST\b|XTAL|OSC_IN|OSC_OUT|VDDIO|VREF|USB_D[MP]|BOOT0/i;
const PASSIVE = /^(R|C|L|D|FB|F|BEAD|RN|RP|#)/i;

for (const name of fs.readdirSync(demos).sort()) {
  const p = path.join(demos, name);
  if (!fs.statSync(p).isDirectory()) continue;
  const t0 = Date.now();
  let snap;
  try {
    snap = parseKicadProjectDir(p);
  } catch (e) {
    console.log(`${name}\tPARSE_FAIL\t${e instanceof Error ? e.message : e}`);
    continue;
  }
  const ms = Date.now() - t0;
  const rows = [];
  for (const c of snap.components) {
    const pc = c.pins?.length ?? 0;
    if (pc < 16) continue;
    if (PASSIVE.test(c.refdes) || isTestPoint(c) || isConnectorCandidate(c)) continue;
    const prefix = `${c.refdes}.`;
    const nets = snap.nets.filter((n) => n.nodes.some((x) => x.startsWith(prefix)));
    const rails = nets.filter((n) => isPowerRailNet(n)).length;
    const fn = (c.pins ?? []).filter((p) => FN.test(p.name) || FN.test(p.net)).length;
    rows.push({
      refdes: c.refdes,
      pins: pc,
      rails,
      fn,
      id: (c.mpn || c.value || c.libId || "").slice(0, 48),
    });
  }
  rows.sort((a, b) => b.pins - a.pins || b.fn - a.fn || b.rails - a.rails);
  const top = rows.slice(0, 4).map((r) => `${r.refdes}:${r.pins}p/r${r.rails}/fn${r.fn}/${r.id}`).join(" | ");
  console.log(`${name}\t${ms}ms\tcomps=${snap.components.length}\t${top || "(none)"}`);
}
