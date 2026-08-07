import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  aggregateOrgMetrics,
  readEvents,
  resetAnalyticsStore,
  track,
} from "../index.ts";

test("aggregateOrgMetrics computes parse rate, weekly pulls, check failures", () => {
  const tmp = path.join(os.tmpdir(), `solderlab-metrics-${Date.now()}.jsonl`);
  process.env.SOLDERLAB_ANALYTICS_PATH = tmp;
  resetAnalyticsStore(tmp);

  track(
    "parse_completed",
    {
      projectId: "p",
      componentCount: 1,
      durationMs: 1,
      success: true,
      unresolvedLibs: 0,
    },
    { orgId: "o1" },
  );
  track(
    "parse_completed",
    {
      projectId: "p",
      componentCount: 1,
      durationMs: 1,
      success: false,
      unresolvedLibs: 2,
    },
    { orgId: "o1" },
  );
  track(
    "bsc_pulled",
    { boardId: "glasgow", format: "c", ciContext: true },
    { orgId: "o1" },
  );
  track(
    "bsc_check_failed",
    { boardId: "glasgow", breakingChangeCount: 2, callSitesFound: 5 },
    { orgId: "o1" },
  );
  track(
    "bsc_check_failed",
    { boardId: "x", breakingChangeCount: 9, callSitesFound: 9 },
    { orgId: "o2" },
  );

  const m = aggregateOrgMetrics(readEvents(), "o1");
  assert.equal(m.parseCompleted, 2);
  assert.equal(m.parseSucceeded, 1);
  assert.equal(m.parseSuccessRate, 0.5);
  assert.equal(m.bscPullsLast7d, 1);
  assert.equal(m.bscCheckFailed, 1);
  assert.equal(m.bscCheckFailedCallSites, 5);

  fs.unlinkSync(tmp);
  delete process.env.SOLDERLAB_ANALYTICS_PATH;
});
