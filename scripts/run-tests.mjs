/**
 * Run workspace tests independently so one failure doesn't hide the rest.
 * Exit 1 if any workspace fails.
 */
import { spawnSync } from "node:child_process";

const workspaces = [
  "@solderlab/design-core",
  "@solderlab/parser",
  "@solderlab/bsc",
  "@solderlab/physics",
  "@solderlab/llm",
  "@solderlab/analytics",
  "@solderlab/cli",
  "@solderlab/parts",
];

let failed = 0;
const results = [];

for (const ws of workspaces) {
  console.log(`\n======== test ${ws} ========`);
  const r = spawnSync("npm", ["run", "test", "-w", ws], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  const code = r.status ?? 1;
  results.push({ ws, code });
  if (code !== 0) failed++;
}

console.log("\n======== summary ========");
for (const r of results) {
  console.log(`${r.code === 0 ? "PASS" : "FAIL"}  ${r.ws}`);
}
process.exit(failed ? 1 : 0);
