import path from "node:path";
import { storageDir } from "@/lib/paths";

export { DATA_REGIONS } from "@/lib/regions";

/** Prefix object keys so residency is reflected in storage layout */
export function regionPrefix(region: string | undefined | null) {
  const r = region && region.length ? region : "local";
  return `regions/${r}`;
}

export function storageKeyFor(
  region: string | undefined | null,
  ...parts: string[]
) {
  return path.posix.join(
    regionPrefix(region),
    ...parts.map((p) => p.replace(/\\/g, "/")),
  );
}

export function absoluteRegionDir(region: string | undefined | null) {
  return path.join(storageDir(), ...regionPrefix(region).split("/"));
}
