import fs from "node:fs";
import path from "node:path";
import { arg, flag, printUsage } from "./args";
import { cmdBscPull } from "./bsc-pull";
import { cmdBscCheck } from "./bsc-check";
import { cmdDiff } from "./diff";
import { cmdFirmwarePatch } from "./firmware-patch";
import { cmdSynthesize } from "./synthesize";
import { cmdAudit } from "./audit";
import { cmdPhysics } from "./physics";

async function cmdPush(argv: string[]): Promise<number> {
  const base = process.env.SOLDERLAB_URL ?? "http://localhost:3000";
  const email = process.env.SOLDERLAB_EMAIL ?? "demo@solderlab.dev";
  const password = process.env.SOLDERLAB_PASSWORD ?? "demo";
  const org = arg(argv, "org");
  const project = arg(argv, "project");
  const file = arg(argv, "file");
  const message = arg(argv, "message", "solderlab push")!;

  if (!org || !project || !file) {
    console.error(
      "Usage: solderlab push --org <slug> --project <slug> --file <zip> [--message msg]",
    );
    return 1;
  }

  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error("File not found:", abs);
    return 1;
  }

  const loginRes = await fetch(`${base}/api/auth/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    console.error("Sign-in failed", await loginRes.text());
    return 1;
  }
  const cookie = loginRes.headers.getSetCookie?.()?.[0] ?? "";
  const cookieHeader =
    cookie ||
    (loginRes.headers.get("set-cookie") ?? "")
      .split(",")
      .map((s) => s.split(";")[0]!.trim())
      .filter(Boolean)
      .join("; ");

  const fd = new FormData();
  const buf = fs.readFileSync(abs);
  fd.set("file", new Blob([buf]), path.basename(abs));
  fd.set("message", message);

  const up = await fetch(
    `${base}/api/orgs/${org}/projects/${project}/revisions`,
    {
      method: "POST",
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      body: fd,
    },
  );
  const text = await up.text();
  if (!up.ok) {
    console.error("Upload failed", text);
    return 1;
  }
  console.log(text);
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const cwd = path.resolve(arg(argv, "cwd", process.cwd())!);

  if (!argv.length || flag(argv, "help") || argv[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const cmd = argv[0];
  if (cmd === "push") {
    process.exit(await cmdPush(argv.slice(1)));
  }

  if (cmd === "diff") {
    process.exit(await cmdDiff(argv.slice(1), cwd));
  }

  if (cmd === "synthesize") {
    process.exit(await cmdSynthesize(argv.slice(1), cwd));
  }

  if (cmd === "audit") {
    process.exit(await cmdAudit(argv.slice(1), cwd));
  }

  if (cmd === "physics") {
    process.exit(await cmdPhysics(argv.slice(1), cwd));
  }

  if (cmd === "firmware") {
    const sub = argv[1];
    if (sub === "patch") {
      process.exit(await cmdFirmwarePatch(argv.slice(2), cwd));
    }
    console.error("Usage: solderlab firmware patch [--scan src] [--out-dir dir] [--compile] [--apply]");
    printUsage();
    process.exit(1);
  }

  if (cmd === "bsc") {
    const sub = argv[1];
    if (sub === "pull") {
      process.exit(await cmdBscPull(argv.slice(2), cwd));
    }
    if (sub === "check") {
      process.exit(await cmdBscCheck(argv.slice(2), cwd));
    }
    console.error("Usage: solderlab bsc <pull|check> …");
    printUsage();
    process.exit(1);
  }

  // Back-compat: bare flags imply push
  if (arg(argv, "org") && arg(argv, "project") && arg(argv, "file")) {
    process.exit(await cmdPush(argv));
  }

  console.error(`Unknown command: ${cmd}`);
  printUsage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
