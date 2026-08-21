#!/usr/bin/env node
/**
 * V4 diagnostic: compare PCB GND pads (A) vs resolver GND nodes (B).
 *   C = B \ A  invented nodes (explains over-count)
 *   D = A \ B  missed nodes   (explains under-count)
 *
 * Usage:
 *   node --import tsx scripts/diag-v4-sets.mjs [board ...]
 * Defaults: openair-max video
 */
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));
const CORPUS =
  process.env.CORPUS ||
  path.join(REPO, "fixtures", "kicad-source-mirror", "demos");

const { parseKicadProjectDir } = await import("../workers/parser/src/index.ts");

const ORACLE_RE =
  /\(pad\s+"[^"]*"[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)/g;

function findPcbs(dir, depth = 0, out = []) {
  if (depth > 3) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findPcbs(p, depth + 1, out);
    else if (e.name.endsWith(".kicad_pcb")) out.push(p);
  }
  return out;
}

/** Oracle occurrence count — same regex as verify-solderlabs.mjs. */
function oracleCount(pcbs) {
  let count = 0;
  for (const p of pcbs) {
    const src = fs.readFileSync(p, "utf8");
    ORACLE_RE.lastIndex = 0;
    let m;
    while ((m = ORACLE_RE.exec(src))) if (m[1] === "GND") count++;
  }
  return count;
}

/**
 * Set of refdes.pin on net GND from placed footprints.
 * Also records pad occurrence multiplicity (SMD+THT dual pads).
 */
function pcbGndPadSet(pcbs) {
  const counts = new Map(); // refdes.pin -> count
  const byFile = [];
  for (const pcbPath of pcbs) {
    const src = fs.readFileSync(pcbPath, "utf8");
    const fileKeys = [];
    let i = 0;
    while (i < src.length) {
      const fpStart = src.indexOf("(footprint ", i);
      if (fpStart < 0) break;
      const header = src.slice(fpStart, fpStart + 8000);
      const refdesMatch =
        header.match(/\(property\s+"Reference"\s+"([^"]*)"/) ||
        header.match(/\(fp_text\s+reference\s+"([^"]*)"/);
      if (!refdesMatch) {
        i = fpStart + 11;
        continue;
      }
      const refdes = refdesMatch[1];
      let depth = 0;
      let end = fpStart;
      for (let j = fpStart; j < src.length; j++) {
        if (src[j] === "(") depth++;
        if (src[j] === ")") {
          depth--;
          if (depth === 0) {
            end = j + 1;
            break;
          }
        }
      }
      const block = src.slice(fpStart, end);
      const padRe =
        /\(pad\s+"([^"]*)"\s+\w+[\s\S]{0,700}?\(net\s+\d+\s+"([^"]*)"\)/g;
      let pm;
      while ((pm = padRe.exec(block))) {
        if (pm[2] === "GND") {
          const key = `${refdes}.${pm[1]}`;
          counts.set(key, (counts.get(key) || 0) + 1);
          fileKeys.push(key);
        }
      }
      i = end;
    }
    byFile.push({
      file: path.relative(path.dirname(pcbs[0]), pcbPath),
      keys: fileKeys,
      unique: new Set(fileKeys).size,
    });
  }
  return { counts, byFile };
}

function classify(id) {
  if (/^#/.test(id)) return "power-symbol";
  const ref = id.split(".")[0] || "";
  if (/^(GND|GNDA|AGND|PGND|DGND|VSS|EARTH)/i.test(ref)) return "power-refdes";
  if (/^(H|MH|HOLE)\d/i.test(ref)) return "mounting-hole";
  if (/^TP\d/i.test(ref)) return "test-point";
  return "component";
}

function summarize(ids) {
  const buckets = new Map();
  for (const id of ids) {
    const k = classify(id);
    buckets.set(k, (buckets.get(k) || 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(" ");
}

function sample(ids, n = 40) {
  const sorted = [...ids].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  if (sorted.length <= n) return sorted.join(", ");
  return (
    sorted.slice(0, n).join(", ") + ` … (+${sorted.length - n} more)`
  );
}

const boards = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["openair-max", "video"];

for (const b of boards) {
  const dir = path.join(CORPUS, b);
  console.log(`\n========== ${b} ==========`);
  if (!fs.existsSync(dir)) {
    console.log("MISSING DIR", dir);
    continue;
  }
  const pcbs = findPcbs(dir);
  console.log(
    "pcb files:",
    pcbs.map((p) => path.relative(dir, p)).join(" | ") || "(none)",
  );
  const oracle = oracleCount(pcbs);
  const { counts, byFile } = pcbGndPadSet(pcbs);
  const A = new Set(counts.keys());
  let Aocc = 0;
  for (const n of counts.values()) Aocc += n;
  console.log(`oracle pad occurrences (verifier regex): ${oracle}`);
  console.log(`footprint GND pad occurrences: ${Aocc}  unique refdes.pin: ${A.size}`);
  for (const f of byFile) {
    console.log(
      `  ${f.file}: ${f.keys.length} occ / ${f.unique} unique`,
    );
  }

  let snap;
  try {
    snap = parseKicadProjectDir(dir);
  } catch (e) {
    console.log("PARSE FAIL", e);
    continue;
  }
  const gnd = (snap.nets || []).find((n) => n.name === "GND");
  const Blist = gnd ? gnd.nodes : [];
  const B = new Set(Blist);
  console.log(
    `B resolver GND nodes: ${Blist.length}  unique: ${B.size}  comps=${snap.components.length} sheets=${snap.sheets.length} boards=${(snap.boards || []).length}`,
  );

  const C = [...B].filter((x) => !A.has(x));
  const D = [...A].filter((x) => !B.has(x));
  console.log(`C = B \\ A  invented unique (${C.length})  [${summarize(C)}]`);
  console.log(`   ${sample(C) || "(empty)"}`);
  console.log(`D = A \\ B  missed unique (${D.length})  [${summarize(D)}]`);
  console.log(`   ${sample(D) || "(empty)"}`);

  // Multiplicity: PCB pads whose key is in B but counted >1 on PCB
  const dual = [...A].filter((k) => B.has(k) && (counts.get(k) || 0) > 1);
  const extraOcc = dual.reduce((s, k) => s + (counts.get(k) - 1), 0);
  console.log(
    `dual-pad keys in both (SMD+THT etc): ${dual.length} extra occurrences: ${extraOcc}`,
  );
  console.log(
    `err vs oracle: got=${Blist.length} truth=${oracle} err=${oracle ? (((Blist.length - oracle) / oracle) * 100).toFixed(0) : "n/a"}%`,
  );
}
