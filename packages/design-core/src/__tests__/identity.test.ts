import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  diffSnapshots,
  type DesignSnapshot,
  type SnapshotComponent,
} from "../index.ts";
import { parseKicadProjectDir } from "../../../../workers/parser/src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");
const corpusRoot = path.join(repoRoot, "fixtures/corpus");

function snapFromComponents(
  components: SnapshotComponent[],
  nets: DesignSnapshot["nets"] = [],
): DesignSnapshot {
  const sheets = [
    ...new Map(
      components.map((c) => [
        c.sheetId,
        { id: c.sheetId, name: c.sheetId, title: c.sheetId },
      ]),
    ).values(),
  ];
  return {
    schemaVersion: 1,
    tool: { name: "kicad", version: "8.0" },
    sheets,
    components,
    nets,
    meta: {
      sheetCount: sheets.length,
      componentCount: components.length,
      netCount: nets.length,
    },
  };
}

function corpusNewerPath(projectId: string): string | null {
  const p = path.join(corpusRoot, projectId, "newer");
  return fs.existsSync(p) ? p : null;
}

test("corpus components carry KiCad-sourced uuid (not generated)", () => {
  const projectDir = corpusNewerPath("glasgow");
  if (!projectDir) {
    // Soft-skip when corpus is not fetched (CI without 2.3GB tree)
    return;
  }

  const snap = parseKicadProjectDir(projectDir);
  assert.ok(snap.components.length > 50, "expected a real glasgow parse");

  const missing = snap.components.filter((c) => !c.uuid);
  assert.equal(
    missing.length,
    0,
    `every component needs a uuid from KiCad; missing: ${missing
      .slice(0, 5)
      .map((c) => c.refdes)
      .join(", ")}`,
  );

  // UUIDs must look like KiCad's, not nanoid/hash we mint
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const c of snap.components.slice(0, 30)) {
    assert.match(c.uuid!, uuidRe, `${c.refdes} uuid=${c.uuid}`);
  }

  // Spot-check: a known glasgow symbol uuid from the s-expression
  const u1 = snap.components.find((c) => c.refdes === "U1");
  assert.ok(u1?.uuid, "U1 present with uuid");
  assert.equal(u1!.uuid, "00000000-0000-0000-0000-00005aca0321");
});

test("refdes renumber with stable uuid → one refdes_renamed, zero add/remove", () => {
  // Corpus-shaped: Glasgow U1 uuid, renumbered as if annotation changed
  const baseComp: SnapshotComponent = {
    refdes: "R5",
    value: "10k",
    footprint: "R_0402",
    uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    sheetId: "power",
    libId: "Device:R",
  };
  const headComp: SnapshotComponent = {
    ...baseComp,
    refdes: "R12",
  };
  const base = snapFromComponents([baseComp]);
  const head = snapFromComponents([headComp]);

  const diff = diffSnapshots(base, head, {
    baseRevisionId: "base",
    headRevisionId: "head",
  });

  assert.equal(diff.components.filter((c) => c.kind === "added").length, 0);
  assert.equal(diff.components.filter((c) => c.kind === "removed").length, 0);
  const renamed = diff.components.filter((c) => c.kind === "refdes_renamed");
  assert.equal(renamed.length, 1, JSON.stringify(diff.components, null, 2));
  assert.equal(renamed[0]!.before?.refdes, "R5");
  assert.equal(renamed[0]!.after?.refdes, "R12");
  assert.equal(renamed[0]!.matchTier, "uuid");
});

test("sheet move with stable uuid → sheet_moved, not delete+add", () => {
  const baseComp: SnapshotComponent = {
    refdes: "C3",
    value: "100nF",
    footprint: "C_0402",
    uuid: "11111111-2222-3333-4444-555555555555",
    sheetId: "root",
    libId: "Device:C",
  };
  const headComp: SnapshotComponent = {
    ...baseComp,
    sheetId: "daughter/power",
  };
  const diff = diffSnapshots(
    snapFromComponents([baseComp]),
    snapFromComponents([headComp]),
    { baseRevisionId: "base", headRevisionId: "head" },
  );

  assert.equal(diff.components.filter((c) => c.kind === "added").length, 0);
  assert.equal(diff.components.filter((c) => c.kind === "removed").length, 0);
  const moved = diff.components.filter((c) => c.kind === "sheet_moved");
  assert.equal(moved.length, 1, JSON.stringify(diff.components, null, 2));
  assert.equal(moved[0]!.before?.sheetId, "root");
  assert.equal(moved[0]!.after?.sheetId, "daughter/power");
  assert.equal(moved[0]!.matchTier, "uuid");
});

test("net rename with identical membership → net_renamed, not delete+add", () => {
  const nodes = ["U1.1", "C12.1", "R5.2"];
  const base = snapFromComponents(
    [
      {
        refdes: "U1",
        value: "AP2112K",
        footprint: "SOT-23-5",
        uuid: "aaaaaaaa-0000-0000-0000-000000000001",
        sheetId: "root",
      },
    ],
    [{ name: "VCC", class: "power", nodes: [...nodes], isNamed: true }],
  );
  const head = snapFromComponents(
    [
      {
        refdes: "U1",
        value: "AP2112K",
        footprint: "SOT-23-5",
        uuid: "aaaaaaaa-0000-0000-0000-000000000001",
        sheetId: "root",
      },
    ],
    [{ name: "VDD_3V3", class: "power", nodes: [...nodes], isNamed: true }],
  );

  const diff = diffSnapshots(base, head, {
    baseRevisionId: "base",
    headRevisionId: "head",
  });

  assert.equal(diff.nets.filter((n) => n.kind === "added").length, 0);
  assert.equal(diff.nets.filter((n) => n.kind === "removed").length, 0);
  const renamed = diff.nets.filter((n) => n.kind === "net_renamed");
  assert.equal(renamed.length, 1, JSON.stringify(diff.nets, null, 2));
  assert.equal(renamed[0]!.beforeName ?? renamed[0]!.name, "VCC");
  assert.equal(renamed[0]!.afterName ?? "VDD_3V3", "VDD_3V3");
});
