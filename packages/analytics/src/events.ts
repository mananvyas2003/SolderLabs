/**
 * Strict product analytics event schema.
 * Only events that answer whether the wedge is working — no vanity pageviews.
 */

export type AnalyticsEventName =
  | "parse_completed"
  | "diff_viewed"
  | "bsc_generated"
  | "bsc_pulled"
  | "bsc_check_failed"
  | "review_merged"
  | "ai_finding_action";

export interface ParseCompletedProps {
  projectId: string;
  componentCount: number;
  durationMs: number;
  success: boolean;
  unresolvedLibs: number;
}

export interface DiffViewedProps {
  reviewId: string;
  changeCount: number;
  timeOnViewMs: number;
}

export interface BscGeneratedProps {
  boardId: string;
  pinCount: number;
  nullFieldCount: number;
}

export interface BscPulledProps {
  boardId: string;
  format: string;
  ciContext: boolean;
}

export interface BscCheckFailedProps {
  boardId: string;
  breakingChangeCount: number;
  callSitesFound: number;
}

export interface ReviewMergedProps {
  reviewId: string;
  timeOpenToMergeMs: number;
  commentCount: number;
}

export interface AiFindingActionProps {
  findingId: string;
  action: "dismissed" | "converted" | "ignored";
}

export interface EventPropsMap {
  parse_completed: ParseCompletedProps;
  diff_viewed: DiffViewedProps;
  bsc_generated: BscGeneratedProps;
  bsc_pulled: BscPulledProps;
  bsc_check_failed: BscCheckFailedProps;
  review_merged: ReviewMergedProps;
  ai_finding_action: AiFindingActionProps;
}

export interface AnalyticsEnvelope<N extends AnalyticsEventName = AnalyticsEventName> {
  id: string;
  name: N;
  ts: string;
  /** Org scope for the admin metrics dashboard. Null for CLI-global events. */
  orgId: string | null;
  props: EventPropsMap[N];
}

/** Runtime allow-list — reject anything else at the track() boundary. */
export const ALLOWED_EVENTS: readonly AnalyticsEventName[] = [
  "parse_completed",
  "diff_viewed",
  "bsc_generated",
  "bsc_pulled",
  "bsc_check_failed",
  "review_merged",
  "ai_finding_action",
] as const;
