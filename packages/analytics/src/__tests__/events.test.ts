import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ALLOWED_EVENTS,
  track,
  resetAnalyticsStore,
  readEvents,
  getAnalyticsStorePath,
} from "../index.ts";

test("ALLOWED_EVENTS is the closed set from the D1 prompt", () => {
  assert.deepEqual([...ALLOWED_EVENTS].sort(), [
    "ai_finding_action",
    "bsc_check_failed",
    "bsc_generated",
    "bsc_pulled",
    "diff_viewed",
    "parse_completed",
    "review_merged",
  ]);
});

test("track appends typed events and rejects unknown names", () => {
  const tmp = path.join(os.tmpdir(), `solderlab-analytics-${Date.now()}.jsonl`);
  process.env.SOLDERLAB_ANALYTICS_PATH = tmp;
  resetAnalyticsStore(tmp);

  track(
    "parse_completed",
    {
      projectId: "p1",
      componentCount: 10,
      durationMs: 42,
      success: true,
      unresolvedLibs: 0,
    },
    { orgId: "org1" },
  );
  track(
    "bsc_check_failed",
    { boardId: "glasgow", breakingChangeCount: 1, callSitesFound: 2 },
    { orgId: null },
  );

  const events = readEvents();
  assert.equal(events.length, 2);
  assert.equal(events[0]!.name, "parse_completed");
  assert.equal(events[0]!.orgId, "org1");
  assert.equal(getAnalyticsStorePath(), tmp);

  assert.throws(() => {
    // @ts-expect-error intentional
    track("page_view", { path: "/" });
  });

  fs.unlinkSync(tmp);
  delete process.env.SOLDERLAB_ANALYTICS_PATH;
});
