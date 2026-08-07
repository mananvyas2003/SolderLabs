#!/usr/bin/env node
/**
 * Download real open-source KiCad projects into fixtures/corpus/.
 * Does NOT synthesize boards. Failures are recorded in manifest.json.
 *
 * Usage: node scripts/fetch-corpus.mjs
 *        npm run corpus:fetch
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CORPUS = path.join(ROOT, "fixtures", "corpus");
const SOURCES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "corpus-sources.json"), "utf8"),
);

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  return res;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rimraf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function walkFiles(dir, pred, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === ".git" || ent.name === "node_modules") continue;
      walkFiles(p, pred, out);
    } else if (pred(ent.name, p)) out.push(p);
  }
  return out;
}

/** Rough metrics from schematic s-expr text (not a full netlist). */
function analyzeProjectDir(dir) {
  const schFiles = walkFiles(dir, (n) => n.endsWith(".kicad_sch"));
  let componentCount = 0;
  let uuidCount = 0;
  let sheetInstCount = 0;
  const versions = new Set();
  let hasSheet = false;

  for (const f of schFiles) {
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const vm = text.match(/\(version\s+(\d{8})\)/);
    if (vm) versions.add(vm[1]);

    // Prefer lib_id symbol instances over raw Reference props (avoids lib_symbols inflation)
    const libs = text.match(/\(lib_id\s+/g);
    if (libs) componentCount += libs.length;

    const uuids = text.match(/\(uuid\s+/g);
    if (uuids) uuidCount += uuids.length;

    if (/\(sheet\b/.test(text)) {
      hasSheet = true;
      const sheets = text.match(/\(sheet\b/g);
      if (sheets) sheetInstCount += sheets.length;
    }
  }

  // Deduplicate multi-unit refs roughly: References ending with ? are power/unannotated
  // Keep raw count; run `npm run corpus:refresh` after fetch for hierarchical truth.

  const versionNums = [...versions].map(Number).filter((n) => !Number.isNaN(n));
  const maxVer = versionNums.length ? Math.max(...versionNums) : null;
  // KiCad 7 ≈ 20221018, 8 ≈ 20231120, 9 ≈ 20250114 (approx year markers)
  let kicadMajor = null;
  if (maxVer != null) {
    if (maxVer >= 20250101) kicadMajor = 9;
    else if (maxVer >= 20231101) kicadMajor = 8;
    else if (maxVer >= 20221001) kicadMajor = 7;
    else if (maxVer >= 20210101) kicadMajor = 6;
    else kicadMajor = maxVer; // fallback raw
  }

  return {
    sheetCount: schFiles.length,
    componentCount,
    uuidAnnotationCount: uuidCount,
    hierarchical: hasSheet || schFiles.length > 1,
    sheetInstanceCount: sheetInstCount,
    kicadFileVersions: [...versions].sort(),
    kicadMajorGuess: kicadMajor,
    schematicFiles: schFiles.map((f) => path.relative(dir, f).replace(/\\/g, "/")),
  };
}

function resolveCommit(repoDir, ref) {
  const r = run("git", ["-C", repoDir, "rev-parse", ref]);
  if (r.status !== 0) return null;
  return (r.stdout || "").trim();
}

function fetchSparse(repoUrl, ref, sparsePaths, dest) {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) rimraf(dest);
  const clone = run("git", [
    "clone",
    "--filter=blob:none",
    "--sparse",
    repoUrl,
    dest,
  ]);
  if (clone.status !== 0) {
    return { ok: false, error: clone.stderr || clone.stdout || "clone failed" };
  }
  const co = run("git", ["-C", dest, "checkout", ref]);
  if (co.status !== 0) {
    run("git", ["-C", dest, "fetch", "--depth", "1", "origin", ref]);
    const co2 = run("git", ["-C", dest, "checkout", ref]);
    if (co2.status !== 0) {
      return { ok: false, error: co2.stderr || `checkout ${ref} failed` };
    }
  }
  const sc = run("git", ["-C", dest, "sparse-checkout", "set", ...sparsePaths]);
  if (sc.status !== 0) {
    return { ok: false, error: sc.stderr || "sparse-checkout failed" };
  }
  const sha = resolveCommit(dest, "HEAD");
  return { ok: true, sha };
}

function fetchCheckout(repoUrl, ref, dest) {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) rimraf(dest);
  // Prefer archive for speed when ref is commitish — but tags/SHAs: shallow clone + checkout
  const clone = run("git", ["clone", "--filter=blob:none", "--no-checkout", repoUrl, dest]);
  if (clone.status !== 0) {
    return { ok: false, error: clone.stderr || "clone failed" };
  }
  // Fetch the ref if needed
  run("git", ["-C", dest, "fetch", "--depth", "1", "origin", "tag", ref]);
  run("git", ["-C", dest, "fetch", "--depth", "1", "origin", ref]);
  const co = run("git", ["-C", dest, "checkout", ref]);
  if (co.status !== 0) {
    // deeper fetch for older tags
    run("git", ["-C", dest, "fetch", "--unshallow"]);
    const co2 = run("git", ["-C", dest, "checkout", ref]);
    if (co2.status !== 0) {
      return { ok: false, error: co2.stderr || `checkout ${ref} failed` };
    }
  }
  const sha = resolveCommit(dest, "HEAD");
  return { ok: true, sha };
}

function copyTree(src, dest) {
  ensureDir(dest);
  fs.cpSync(src, dest, { recursive: true });
}

async function main() {
  ensureDir(CORPUS);
  const cache = path.join(CORPUS, ".cache");
  ensureDir(cache);

  const manifest = {
    fetchedAt: new Date().toISOString(),
    selectionCriteria: {
      count: 10,
      minHierarchical: 4,
      minLarge200: 3,
      minDualRevision: 5,
      kicadMajorsDesired: [7, 8, 9],
      noSynthetic: true,
    },
    projects: [],
  };

  for (const src of SOURCES.projects) {
    console.log(`\n== ${src.id} ==`);
    const entry = {
      id: src.id,
      sourceRepoUrl: src.repo.replace(/\.git$/, ""),
      notes: src.notes ?? null,
      revisions: [],
      failed: false,
      errors: [],
    };

    for (const rev of src.revisions) {
      const outDir = path.join(CORPUS, src.id, rev.label);
      const cacheKey = `${src.id}-${rev.label}`.replace(/[^a-zA-Z0-9._-]/g, "_");
      const cacheDir = path.join(cache, cacheKey);
      console.log(`  fetching ${rev.ref} …`);

      let result;
      try {
        if (src.sparsePaths?.length) {
          result = fetchSparse(src.repo, rev.ref, src.sparsePaths, cacheDir);
        } else {
          result = fetchCheckout(src.repo, rev.ref, cacheDir);
        }
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }

      if (!result.ok) {
        console.error(`  FAIL: ${result.error}`);
        entry.failed = true;
        entry.errors.push({ ref: rev.ref, error: String(result.error).slice(0, 500) });
        entry.revisions.push({
          label: rev.label,
          requestedRef: rev.ref,
          commitSha: null,
          status: "failed",
          error: String(result.error).slice(0, 500),
        });
        continue;
      }

      const contentRoot = src.subdir && src.subdir !== "."
        ? path.join(cacheDir, src.subdir)
        : cacheDir;

      if (!fs.existsSync(contentRoot)) {
        const msg = `subdir missing after checkout: ${src.subdir}`;
        console.error(`  FAIL: ${msg}`);
        entry.failed = true;
        entry.errors.push({ ref: rev.ref, error: msg });
        entry.revisions.push({
          label: rev.label,
          requestedRef: rev.ref,
          commitSha: result.sha,
          status: "failed",
          error: msg,
        });
        continue;
      }

      if (fs.existsSync(outDir)) rimraf(outDir);
      copyTree(contentRoot, outDir);
      // Drop nested .git if copied
      rimraf(path.join(outDir, ".git"));

      const metrics = analyzeProjectDir(outDir);
      if (!metrics.sheetCount) {
        const msg = "no .kicad_sch files found after checkout";
        console.error(`  FAIL: ${msg}`);
        entry.failed = true;
        entry.errors.push({ ref: rev.ref, error: msg });
        entry.revisions.push({
          label: rev.label,
          requestedRef: rev.ref,
          commitSha: result.sha,
          status: "failed",
          error: msg,
          ...metrics,
        });
        continue;
      }
      console.log(
        `  OK ${result.sha?.slice(0, 10)} · sheets=${metrics.sheetCount} comps~${metrics.componentCount} hier=${metrics.hierarchical} kicad~${metrics.kicadMajorGuess}`,
      );

      entry.revisions.push({
        label: rev.label,
        requestedRef: rev.ref,
        commitSha: result.sha,
        status: "ok",
        path: path.relative(ROOT, outDir).replace(/\\/g, "/"),
        ...metrics,
      });
    }

    // Summarize for quick criteria checks (prefer newer revision metrics)
    const okRevs = entry.revisions.filter((r) => r.status === "ok");
    const primary = okRevs.find((r) => r.label === "newer") ?? okRevs[0];
    entry.primary = primary
      ? {
          commitSha: primary.commitSha,
          componentCount: primary.componentCount,
          sheetCount: primary.sheetCount,
          hierarchical: primary.hierarchical,
          kicadMajorGuess: primary.kicadMajorGuess,
          kicadFileVersions: primary.kicadFileVersions,
        }
      : null;

    manifest.projects.push(entry);
  }

  // Criteria report
  const ok = manifest.projects.filter((p) => p.primary);
  const hierarchical = ok.filter((p) => p.primary.hierarchical);
  const large = ok.filter((p) => (p.primary.componentCount ?? 0) > 200);
  const dual = manifest.projects.filter(
    (p) => p.revisions.filter((r) => r.status === "ok").length >= 2,
  );
  const majors = new Set(
    ok.map((p) => p.primary.kicadMajorGuess).filter((x) => x != null),
  );

  manifest.summary = {
    attempted: SOURCES.projects.length,
    succeeded: ok.length,
    failed: manifest.projects.filter((p) => !p.primary).length,
    hierarchicalCount: hierarchical.length,
    largeOver200Count: large.length,
    dualRevisionCount: dual.length,
    kicadMajorsObserved: [...majors].sort(),
    criteria: {
      hierarchicalOk: hierarchical.length >= 4,
      largeOk: large.length >= 3,
      dualOk: dual.length >= 5,
      versionSpanOk: [7, 8, 9].filter((m) => majors.has(m)).length >= 2,
    },
  };

  const manifestPath = path.join(CORPUS, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${manifestPath}`);
  console.log(JSON.stringify(manifest.summary, null, 2));

  // Keep cache? Drop to save disk — caches are huge
  rimraf(cache);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
