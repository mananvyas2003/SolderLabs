export function flag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

export function arg(argv: string[], name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
    return argv[i + 1];
  }
  return fallback;
}

export function printUsage(): void {
  console.log(`SolderLab CLI

Usage:
  solderlab diff --base <dir> --head <dir> [--message msg] [--json]
  solderlab push --org <slug> --project <slug> --file <zip> [--message msg]
  solderlab bsc pull --board <slug> --rev <rev|latest> --out <dir> --format c|zephyr|rust|json|kconfig
  solderlab bsc check [--scan <src-dir>] [--lock <path>] [--cwd <dir>]

Env:
  SOLDERLAB_URL, SOLDERLAB_EMAIL, SOLDERLAB_PASSWORD   (push)
  SOLDERLAB_BSC_DIR   Registry directory of <board>.bsc.json (default: fixtures/corpus/bsc)

Note: \`diff\` runs the parser locally — nothing is uploaded.
`);
}
