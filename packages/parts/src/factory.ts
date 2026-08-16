import type { SolderLabDb } from "@solderlab/db";
import { ManualPartDataProvider } from "./manual.ts";
import { NexarPartDataProvider } from "./nexar.ts";
import {
  PART_DATA_API_KEY,
  PART_DATA_BASE_URL,
  PART_DATA_PROVIDER,
  type PartDataProvider,
} from "./types.ts";

export function createPartDataProvider(
  db?: SolderLabDb,
  orgId?: string,
): PartDataProvider {
  const name = (process.env[PART_DATA_PROVIDER] ?? "nexar").toLowerCase();
  if (name === "manual") {
    const rows = (db?.manualPartCatalog ?? []).filter((r) =>
      orgId ? r.orgId === orgId : true,
    );
    return new ManualPartDataProvider(rows);
  }
  return new NexarPartDataProvider({
    apiKey: process.env[PART_DATA_API_KEY],
    baseUrl: process.env[PART_DATA_BASE_URL],
  });
}

export { PART_DATA_API_KEY, PART_DATA_BASE_URL, PART_DATA_PROVIDER };
