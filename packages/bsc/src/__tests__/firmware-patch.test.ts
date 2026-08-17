import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { BoardSupportContract } from "../types.ts";
import { emitC } from "../emit/c.ts";
import { generateFirmwarePatch } from "../firmware-patch.ts";
import { buildFirmwarePatchCorpus } from "../firmware-patch-corpus.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const glasgowPath = path.resolve(
  here,
  "../../../../fixtures/corpus/bsc/glasgow.bsc.json",
);

const sample: BoardSupportContract = {
  schemaVersion: "1.0",
  boardName: "demo-board",
  revision: "A",
  generatedFrom: { revisionId: "rev-1", sha256: "a".repeat(64) },
  mcus: [
    {
      refdes: "U1",
      mpn: "STM32F103C8T6",
      package: "LQFP-48",
      confidence: 0.71,
      confidenceNotes: [],
    },
  ],
  pins: [
    {
      mcuRefdes: "U1",
      pinNumber: "11",
      pinName: "PA1",
      net: "I2C1_SDA",
      function: null,
      connectedTo: [],
      direction: null,
      pullState: null,
      confidenceNotes: [],
    },
  ],
  revStraps: [],
  busDevices: [
    {
      bus: "i2c",
      address: "0x3C",
      chipSelect: null,
      refdes: "U5",
      mpn: "SSD1306",
      description: "OLED",
      confidenceNotes: [],
    },
  ],
  powerRails: [],
  connectors: [],
  testPoints: [],
  confidenceNotes: [],
};

function findCCompiler(): string | null {
  if (process.env.CC && process.env.CC.length) return process.env.CC;
  for (const bin of ["gcc", "clang", "cc"]) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 8000 });
    if (r.status === 0) return bin;
  }
  const mingw = "D:\\msys64\\mingw64\\bin\\gcc.exe";
  if (fs.existsSync(mingw)) return mingw;
  return null;
}

function compileTree(
  cc: string,
  files: Array<{ path: string; contents: string }>,
): { ok: boolean; log: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "solderlab-fw-"));
  for (const f of files) {
    const abs = path.join(tmp, f.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.contents);
  }
  const src = path.join(tmp, "src/main.c");
  const out = path.join(tmp, process.platform === "win32" ? "main.exe" : "main");
  const r = spawnSync(
    cc,
    ["-std=c11", "-Wall", "-Werror", "-Iinclude", src, "-o", out],
    { encoding: "utf8", timeout: 20000, cwd: tmp },
  );
  const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { ok: r.status === 0 && fs.existsSync(out), log };
}

test("firmware patch rewrites a magic pad to the emitted macro", () => {
  const locked = sample;
  const current = structuredClone(sample);
  current.pins[0]!.net = "HIJACKED_SDA";
  current.revision = "B";
  const patch = generateFirmwarePatch({
    locked,
    current,
    files: [
      {
        path: "src/main.c",
        contents: `#include "board.h"
#define APP_SDA 11 /* PA1 */
int main(void) { return APP_SDA; }
`,
      },
    ],
  });
  assert.equal(patch.files.some((f) => f.path === "include/board.h"), true);
  assert.equal(patch.files.find((f) => f.path === "include/board.h")?.contents, emitC(current));
  const src = patch.files.find((f) => f.path === "src/main.c")?.contents ?? "";
  assert.match(src, /SOLDERLAB_PIN_PA1/);
  assert.equal(src.includes("11 /* PA1 */"), false);
  assert.ok(patch.migrations.length >= 1);
});

test("firmware patch does not invent pin numbers", () => {
  const current = structuredClone(sample);
  current.pins[0]!.net = "LED";
  const patch = generateFirmwarePatch({
    locked: sample,
    current,
    files: [{ path: "src/main.c", contents: `#include "board.h"\nint main(void) { return SOLDERLAB_PIN_PA1; }\n` }],
  });
  const header = patch.files.find((f) => f.path === "include/board.h")?.contents ?? "";
  assert.match(header, /#define SOLDERLAB_PIN_PA1 11/);
  assert.equal(header.includes("#define SOLDERLAB_PIN_PA1 12"), false);
  assert.equal(patch.migrations.length, 0);
});

test("firmware patch I2C literal becomes the emitted address macro", () => {
  const current = structuredClone(sample);
  current.busDevices[0]!.address = "0x3D";
  const patch = generateFirmwarePatch({
    locked: sample,
    current,
    files: [
      {
        path: "src/main.c",
        contents: `#include "board.h"
#define OLED_ADDR 0x3C /* U5 */
int main(void) { return OLED_ADDR; }
`,
      },
    ],
  });
  const src = patch.files.find((f) => f.path === "src/main.c")?.contents ?? "";
  assert.match(src, /SOLDERLAB_I2C_U5_ADDR/);
  const header = patch.files.find((f) => f.path === "include/board.h")?.contents ?? "";
  assert.match(header, /#define SOLDERLAB_I2C_U5_ADDR 0x3D/);
});

test("AI-3: 20-case firmware patch corpus compiles ≥80%", (t) => {
  assert.equal(fs.existsSync(glasgowPath), true, "glasgow.bsc.json missing");
  const glasgow = JSON.parse(fs.readFileSync(glasgowPath, "utf8")) as BoardSupportContract;
  const cases = buildFirmwarePatchCorpus(glasgow);
  assert.equal(cases.length, 20);

  const cc = findCCompiler();
  if (!cc) {
    if (process.env.CI) {
      assert.fail("C compiler required in CI for firmware patch corpus");
    }
    t.skip("no C compiler on PATH");
    return;
  }

  const rows: Array<{ id: string; compiled: boolean; status: string }> = [];
  for (const c of cases) {
    const patch = generateFirmwarePatch({
      locked: c.locked,
      current: c.current,
      files: c.files,
    });
    assert.equal(
      patch.files.find((f) => f.path === "include/board.h")?.contents,
      emitC(c.current),
      `${c.id} board.h is not emitC(current)`,
    );
    if (c.kind === "magic" || c.kind === "i2c") {
      assert.ok(patch.migrations.length >= 1, `${c.id} expected a source migration`);
    }
    const overlay = new Map(c.files.map((f) => [f.path, f.contents]));
    for (const f of patch.files) overlay.set(f.path, f.contents);
    const compiled = compileTree(cc, [...overlay.entries()].map(([p, contents]) => ({ path: p, contents })));
    rows.push({ id: c.id, compiled: compiled.ok, status: patch.status });
    if (!compiled.ok) {
      console.error(`${c.id} compile failed\n${compiled.log}`);
    }
  }

  const compiled = rows.filter((r) => r.compiled).length;
  const rate = compiled / rows.length;
  console.log(
    `firmware-patch corpus ${compiled}/${rows.length} compiled (${(rate * 100).toFixed(0)}%) cc=${cc}`,
  );
  for (const r of rows) {
    console.log(`${r.compiled ? "PASS" : "FAIL"}\t${r.id}\t${r.status}`);
  }
  assert.ok(
    rate >= 0.8,
    `compile rate ${compiled}/${rows.length} is below 80%`,
  );
});
