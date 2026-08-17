import type { BoardSupportContract, BscBusDevice, BscPin } from "./types.ts";
import { diffBSC, type BSCChange } from "./diff.ts";
import {
  assignPinMacros,
  emitC,
  i2cAddrMacro,
} from "./emit/c.ts";
import { isNamedSignal, toIdent } from "./emit/common.ts";
import { symbolsForChange } from "./symbols.ts";

export interface FirmwareFile {
  path: string;
  contents: string;
}

export interface FirmwareMigration {
  path: string;
  line: number;
  before: string;
  after: string;
  reason: string;
  symbol: string;
}

export type FirmwarePatchStatus =
  | "verified"
  | "verified_with_warnings"
  | "unverifiable";

export interface FirmwarePatchRequest {
  locked: BoardSupportContract;
  current: BoardSupportContract;
  files: FirmwareFile[];
  boardHeaderPath?: string;
}

export interface FirmwarePatchResult {
  status: FirmwarePatchStatus;
  coverage: number;
  changes: BSCChange[];
  breaking: BSCChange[];
  files: FirmwareFile[];
  migrations: FirmwareMigration[];
  withheld: string[];
  boardHeaderPath: string;
}

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}

function isBoardHeader(p: string): boolean {
  return /(^|\/)board\.h$/i.test(posix(p));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenHit(line: string, sym: string): boolean {
  if (!sym || sym.length < 2) return false;
  const re = new RegExp(
    `(^|[^A-Za-z0-9_])${escapeRegExp(sym)}([^A-Za-z0-9_]|$)`,
  );
  return re.test(line);
}

function pinIdents(pin: BscPin, macro: string): string[] {
  const out = new Set<string>([macro]);
  if (pin.pinName && pin.pinName !== "~") {
    out.add(toIdent(pin.pinName, "PIN"));
    for (const part of pin.pinName.split(/[/\\_]+/)) {
      const id = toIdent(part, "PIN");
      if (id.length >= 3) out.add(id);
    }
  }
  if (isNamedSignal(pin.net)) out.add(toIdent(pin.net!, "NET"));
  return [...out];
}

function lineMentions(line: string, idents: string[]): boolean {
  return idents.some((id) => tokenHit(line, id));
}

function pinKey(p: BscPin): string {
  return `${p.mcuRefdes}:${p.pinNumber}`;
}

interface LiteralTarget {
  literal: string;
  macro: string;
  idents: string[];
  reason: string;
}

function pinTargets(
  locked: BoardSupportContract,
  breaking: BSCChange[],
): LiteralTarget[] {
  const macros = new Map(assignPinMacros(locked).map((x) => [pinKey(x.pin), x]));
  const out: LiteralTarget[] = [];
  const seen = new Set<string>();
  for (const change of breaking) {
    if (
      change.kind !== "pin_reassigned" &&
      change.kind !== "pin_removed" &&
      change.kind !== "pin_added"
    ) {
      continue;
    }
    const pin = (change.before ?? change.after) as BscPin | null;
    if (!pin?.pinNumber) continue;
    const hit = macros.get(pinKey(pin));
    const macro = hit?.macro;
    if (!macro) continue;
    const key = `${macro}:${pin.pinNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      literal: pin.pinNumber,
      macro,
      idents: pinIdents(pin, macro),
      reason: `${change.kind} ${pinKey(pin)} → ${macro}`,
    });
  }
  return out;
}

function i2cTargets(
  locked: BoardSupportContract,
  breaking: BSCChange[],
): LiteralTarget[] {
  const out: LiteralTarget[] = [];
  for (const change of breaking) {
    if (change.kind !== "i2c_address_changed") continue;
    const before = change.before as BscBusDevice | null;
    if (!before?.address || !before.refdes) continue;
    const macro = i2cAddrMacro(before);
    out.push({
      literal: before.address,
      macro,
      idents: [macro, before.refdes, toIdent(before.refdes, "DEV")],
      reason: `i2c_address_changed ${before.refdes} → ${macro}`,
    });
  }
  return out;
}

/**
 * Replace a C integer / hex literal only in #define and assignment forms,
 * and only when the line already names the pin or device.
 */
function rewriteLiteralLine(
  line: string,
  target: LiteralTarget,
): string | null {
  if (line.includes(target.macro)) return null;
  if (/^\s*#define\s+SOLDERLAB_/i.test(line)) return null;
  if (!lineMentions(line, target.idents)) return null;
  const lit = escapeRegExp(target.literal);
  const defineRe = new RegExp(
    `^(#define\\s+[A-Za-z_][A-Za-z0-9_]*\\s+)${lit}(\\b)(.*)$`,
  );
  const assignRe = new RegExp(
    `([=,(]\\s*)${lit}(\\s*[;,)\\s])`,
  );
  if (defineRe.test(line)) {
    return line.replace(defineRe, `$1${target.macro}$2$3`);
  }
  if (assignRe.test(line)) {
    return line.replace(assignRe, `$1${target.macro}$2`);
  }
  return null;
}

function scanSites(
  files: FirmwareFile[],
  symbols: string[],
): Array<{ path: string; line: number; text: string; symbol: string }> {
  const uniq = [...new Set(symbols.filter((s) => s.length >= 2))];
  const hits: Array<{ path: string; line: number; text: string; symbol: string }> =
    [];
  for (const file of files) {
    if (isBoardHeader(file.path)) continue;
    const lines = file.contents.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i]!;
      for (const sym of uniq) {
        if (tokenHit(text, sym)) {
          hits.push({ path: file.path, line: i + 1, text: text.trim(), symbol: sym });
        }
      }
    }
  }
  return hits;
}

function changeHandled(
  change: BSCChange,
  sites: Array<{ symbol: string; path: string }>,
  migrations: FirmwareMigration[],
  symbols: string[],
): boolean {
  const relevant = sites.filter((s) => symbols.includes(s.symbol));
  if (relevant.length === 0) return true;
  if (relevant.every((s) => s.symbol.startsWith("SOLDERLAB_"))) return true;
  return relevant.every((s) =>
    migrations.some((m) => m.path === s.path && symbols.includes(m.symbol)),
  );
}

/**
 * Deterministic firmware patch from a BSC delta.
 * Never invents pin numbers or I2C addresses — those come from emitC(current).
 * Source rewrites are conservative: #define / assignment literals that already
 * name the pin or device, replaced with the emitted macro.
 */
export function generateFirmwarePatch(
  req: FirmwarePatchRequest,
): FirmwarePatchResult {
  const boardHeaderPath = posix(req.boardHeaderPath ?? "include/board.h");
  const changes = diffBSC(req.locked, req.current);
  const breaking = changes.filter((c) => c.severity === "breaking");
  const boardH = emitC(req.current);
  const withheld: string[] = [];
  const migrations: FirmwareMigration[] = [];

  const targets = [
    ...pinTargets(req.locked, breaking),
    ...i2cTargets(req.locked, breaking),
  ];

  const outFiles = new Map<string, string>();
  outFiles.set(boardHeaderPath, boardH);

  for (const file of req.files) {
    const path = posix(file.path);
    if (isBoardHeader(path)) {
      outFiles.set(path === boardHeaderPath ? boardHeaderPath : path, boardH);
      continue;
    }
    const lines = file.contents.split(/\r?\n/);
    let changed = false;
    const next = lines.map((line, idx) => {
      let cur = line;
      for (const target of targets) {
        const rewritten = rewriteLiteralLine(cur, target);
        if (rewritten == null || rewritten === cur) continue;
        migrations.push({
          path,
          line: idx + 1,
          before: line.trim(),
          after: rewritten.trim(),
          reason: target.reason,
          symbol: target.macro,
        });
        cur = rewritten;
        changed = true;
      }
      return cur;
    });
    if (changed) outFiles.set(path, next.join("\n"));
  }

  const allFilesForScan = req.files.map((f) => ({
    path: posix(f.path),
    contents: isBoardHeader(f.path)
      ? boardH
      : (outFiles.get(posix(f.path)) ?? f.contents),
  }));

  let handled = 0;
  for (const change of breaking) {
    const symbols = symbolsForChange(change);
    const sites = scanSites(allFilesForScan, symbols);
    if (changeHandled(change, sites, migrations, symbols)) {
      handled += 1;
      continue;
    }
    withheld.push(
      `${change.kind}: ${change.message} — call sites not rewritten`,
    );
  }

  const coverage =
    breaking.length === 0 ? 1 : handled / breaking.length;

  let status: FirmwarePatchStatus = "verified";
  if (withheld.length) {
    status = coverage >= 0.8 ? "verified_with_warnings" : "unverifiable";
  }

  const files = [...outFiles.entries()]
    .map(([path, contents]) => ({ path, contents }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    status,
    coverage: Math.round(coverage * 1e6) / 1e6,
    changes,
    breaking,
    files,
    migrations,
    withheld,
    boardHeaderPath,
  };
}
