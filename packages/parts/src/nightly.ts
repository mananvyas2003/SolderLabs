import { getDb, persist, nowIso } from "@solderlab/db";
import { createPartDataProvider } from "./factory.ts";
import { runPartWatchJob } from "./job.ts";
import { ManualPartDataProvider } from "./manual.ts";
import { PART_DATA_PROVIDER } from "./types.ts";

export async function runNightlyPartWatch() {
  const db = getDb();
  const name = (process.env[PART_DATA_PROVIDER] ?? "nexar").toLowerCase();
  const started = db.partAlerts.length;
  const shareLookups = name !== "manual";

  if (name === "manual") {
    for (const org of db.organizations) {
      const provider = new ManualPartDataProvider(
        db.manualPartCatalog.filter((r) => r.orgId === org.id),
      );
      await runPartWatchJob(db, {
        provider,
        persist,
        nowIso,
        orgIds: [org.id],
        shareLookups: false,
        delayMs: 0,
      });
    }
  } else {
    await runPartWatchJob(db, {
      provider: createPartDataProvider(db),
      persist,
      nowIso,
      shareLookups,
    });
  }

  return {
    newAlerts: db.partAlerts.length - started,
    watches: db.partWatches.length,
  };
}

