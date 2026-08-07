import type { BSCChange } from "./diff";
import { hasBreakingChanges } from "./diff";

/**
 * Semver the BSC from a diff: any "breaking" entry forces a major bump.
 * Additive-only → minor. Compatible-only / empty → patch.
 */
export function nextBscVersion(
  current: string,
  changes: BSCChange[],
): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(current.trim());
  let major = m ? Number(m[1]) : 0;
  let minor = m ? Number(m[2]) : 1;
  let patch = m ? Number(m[3]) : 0;

  if (hasBreakingChanges(changes)) {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (changes.some((c) => c.severity === "additive")) {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}
