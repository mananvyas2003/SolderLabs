/**
 * Report KiCad UUID coverage across fixtures/corpus newer (or single) trees.
 * Usage: node --import tsx scripts/uuid-coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { parseKicadProjectDir } from "../workers/parser/src/index.ts";
import {
  formatIdentityCoverage,
  resolveIdentity,
} from "../packages/design-core/src/identity.ts";

const corpusRoot = path.resolve("fixtures/corpus");
const manifestPath = path.join(corpusRoot, "manifest.json");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pickDir(projectId) {
  const newer = path.join(corpusRoot, projectId, "newer");
  const older = path.join(corpusRoot, projectId, "older");
  if (fs.existsSync(newer)) return { label: "newer", dir: newer, older: fs.existsSync(older) ? older : null };
  if (fs.existsSync(older)) return { label: "older", dir: older, older: null };
  return null;
}

const rows = [];
let totalComps = 0;
let totalWithUuid = 0;

const projects = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8")).projects.map((p) => p.id)
  : fs.readdirSync(corpusRoot).filter((n) =>
      fs.statSync(path.join(corpusRoot, n)).isDirectory(),
    );

for (const id of projects) {
  const picked = pickDir(id);
  if (!picked) {
    rows.push({ id, status: "missing" });
    continue;
  }
  try {
    const snap = parseKicadProjectDir(picked.dir);
    const withUuid = snap.components.filter(
      (c) => c.uuid && UUID_RE.test(c.uuid),
    ).length;
    totalComps += snap.components.length;
    totalWithUuid += withUuid;
    let identityLog = "";
    if (picked.older) {
      const base = parseKicadProjectDir(picked.older);
      identityLog = formatIdentityCoverage(
        resolveIdentity(base.components, snap.components),
      );
    }
    rows.push({
      id,
      rev: picked.label,
      components: snap.components.length,
      withUuid,
      coverage:
        snap.components.length === 0
          ? "n/a"
          : `${((withUuid / snap.components.length) * 100).toFixed(1)}%`,
      identity: identityLog || "—",
    });
  } catch (e) {
    rows.push({ id, status: "error", error: String(e.message || e) });
  }
}

console.log("UUID coverage (parsed snapshot components)\n");
for (const r of rows) {
  if (r.status) {
    console.log(`${r.id}: ${r.status}${r.error ? " — " + r.error : ""}`);
    continue;
  }
  console.log(
    `${r.id} [${r.rev}]: ${r.withUuid}/${r.components} (${r.coverage})` +
      (r.identity !== "—" ? `\n  dual-rev ${r.identity}` : ""),
  );
}
console.log(
  `\nTOTAL: ${totalWithUuid}/${totalComps} (${
    totalComps ? ((totalWithUuid / totalComps) * 100).toFixed(1) : 0
  }%) have KiCad UUID`,
);
