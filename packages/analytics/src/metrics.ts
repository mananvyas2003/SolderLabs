import type { AnalyticsEnvelope } from "./events";
import { readEvents } from "./store";

export interface OrgMetrics {
  orgId: string;
  parseCompleted: number;
  parseSucceeded: number;
  parseSuccessRate: number | null;
  bscPullsLast7d: number;
  bscCheckFailed: number;
  /** Sum of callSitesFound on failed checks — the wedge signal */
  bscCheckFailedCallSites: number;
  diffViewed: number;
  reviewMerged: number;
  aiFindingActions: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function aggregateOrgMetrics(
  events: AnalyticsEnvelope[],
  orgId: string,
  now = Date.now(),
): OrgMetrics {
  const scoped = events.filter((e) => e.orgId === orgId);
  let parseCompleted = 0;
  let parseSucceeded = 0;
  let bscPullsLast7d = 0;
  let bscCheckFailed = 0;
  let bscCheckFailedCallSites = 0;
  let diffViewed = 0;
  let reviewMerged = 0;
  let aiFindingActions = 0;

  for (const e of scoped) {
    switch (e.name) {
      case "parse_completed": {
        parseCompleted++;
        if ((e.props as { success: boolean }).success) parseSucceeded++;
        break;
      }
      case "bsc_pulled": {
        if (now - new Date(e.ts).getTime() <= WEEK_MS) bscPullsLast7d++;
        break;
      }
      case "bsc_check_failed": {
        bscCheckFailed++;
        bscCheckFailedCallSites +=
          (e.props as { callSitesFound: number }).callSitesFound ?? 0;
        break;
      }
      case "diff_viewed":
        diffViewed++;
        break;
      case "review_merged":
        reviewMerged++;
        break;
      case "ai_finding_action":
        aiFindingActions++;
        break;
      default:
        break;
    }
  }

  return {
    orgId,
    parseCompleted,
    parseSucceeded,
    parseSuccessRate:
      parseCompleted === 0 ? null : parseSucceeded / parseCompleted,
    bscPullsLast7d,
    bscCheckFailed,
    bscCheckFailedCallSites,
    diffViewed,
    reviewMerged,
    aiFindingActions,
  };
}

export function metricsForAllOrgs(
  orgIds: string[],
  opts?: { includeCliNullOrg?: boolean },
): OrgMetrics[] {
  const events = readEvents();
  const ids = [...orgIds];
  if (opts?.includeCliNullOrg) ids.push("__cli__");
  return ids.map((id) => {
    if (id === "__cli__") {
      const cliEvents = events.filter((e) => e.orgId == null);
      // Remap null-org events through a synthetic aggregator
      const remapped = cliEvents.map((e) => ({ ...e, orgId: "__cli__" }));
      return aggregateOrgMetrics(remapped, "__cli__");
    }
    return aggregateOrgMetrics(events, id);
  });
}
