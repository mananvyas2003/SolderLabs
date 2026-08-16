export type Role = "admin" | "contributor" | "viewer";

/** Legacy roles still accepted on read and normalized in migrate(). */
export type LegacyRole =
  | "owner"
  | "engineer"
  | "reviewer"
  | "procurement"
  | Role;

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  role: Role | string;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string; // private | internal
  defaultBranch: string;
  requireGreenChecks: boolean;
  requireApproval: boolean;
  /** How many distinct approvers (not the author) must sign the current head. */
  requiredApprovals: number;
  createdAt: string;
}

export interface Branch {
  id: string;
  projectId: string;
  name: string;
  headRevisionId: string | null;
}

export interface Revision {
  id: string;
  projectId: string;
  branchId: string | null;
  parentRevisionId: string | null;
  message: string;
  authorId: string;
  parseStatus: string;
  createdAt: string;
}

export interface Artifact {
  id: string;
  revisionId: string;
  kind: string;
  path: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface DesignSnapshotRow {
  id: string;
  revisionId: string;
  schemaVersion: number;
  dataJson: string;
}

export interface PcbSnapshotRow {
  id: string;
  revisionId: string;
  schemaVersion: number;
  dataJson: string;
}

export interface BomLineRow {
  id: string;
  revisionId: string;
  refdes: string;
  value: string;
  footprint: string;
  mpn: string | null;
  manufacturer: string | null;
  qty: number;
  attrsJson: string | null;
}

/** Platform-owned BOM metadata — never written back to CAD. */
export interface BomPlatformLine {
  id: string;
  projectId: string;
  uuid: string | null;
  refdes: string;
  mpn: string | null;
  manufacturer: string | null;
  alternateMpnsJson: string | null;
  dnp: boolean;
  notes: string | null;
  lockedValue: string | null;
  lockedFootprint: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface DiffBundleRow {
  id: string;
  projectId: string;
  baseRevisionId: string;
  headRevisionId: string;
  dataJson: string;
  createdAt: string;
}

export interface DesignReview {
  id: string;
  projectId: string;
  number: number;
  title: string;
  body: string | null;
  baseRevisionId: string;
  headRevisionId: string;
  state: string;
  authorId: string;
  /** Branch whose head is updated on merge. */
  targetBranchId: string | null;
  createdAt: string;
  mergedAt: string | null;
}

export interface ReviewApproval {
  id: string;
  reviewId: string;
  userId: string;
  state: "approved" | "changes_requested";
  /** Head revision id at the time of the record — stale when head moves. */
  headRevisionSha: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface Comment {
  id: string;
  reviewId: string;
  authorId: string;
  body: string;
  parentId: string | null;
  anchorKind: string | null;
  anchorRef: string | null;
  /** KiCad UUID — survives refdes renumbers across revisions */
  anchorUuid: string | null;
  anchorMetaJson: string | null;
  createdAt: string;
}

export interface CheckRun {
  id: string;
  projectId: string;
  revisionId: string;
  reviewId: string | null;
  name: string;
  status: string;
  /** Typed gate signal — never parse English summaries. */
  severity?: string | null;
  summary: string | null;
  detailsJson: string | null;
  createdAt: string;
}

export interface LibraryPart {
  id: string;
  orgId: string;
  mpn: string;
  manufacturer: string | null;
  footprint: string | null;
  status: "approved" | "forbidden" | "review" | string;
  notes: string | null;
  alternatesJson: string | null;
  createdAt: string;
}

export interface Release {
  id: string;
  projectId: string;
  tag: string;
  title: string;
  revisionId: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  immutable: boolean;
}

export interface ReleaseArtifact {
  id: string;
  releaseId: string;
  path: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface DownloadAudit {
  id: string;
  releaseId: string;
  userId: string;
  createdAt: string;
}

/**
 * Scoped, expiring share for CM / fab / supplier —
 * Gerbers + BOM only, never CAD source by default.
 */
export interface ReleaseShare {
  id: string;
  releaseId: string;
  token: string;
  label: string;
  allowGerbers: boolean;
  allowBom: boolean;
  allowCad: boolean;
  watermark: string | null;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface ReleaseShareAudit {
  id: string;
  shareId: string;
  action: string;
  metaJson: string | null;
  createdAt: string;
}

/** Physical board unit for QR → digital twin. */
export interface BoardUnit {
  id: string;
  projectId: string;
  serial: string;
  revisionId: string;
  notes: string | null;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  orgId: string;
  projectId: string | null;
  actorId: string | null;
  action: string;
  summary: string;
  metaJson: string | null;
  createdAt: string;
}

export interface Webhook {
  id: string;
  orgId: string;
  url: string;
  secret: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  orgId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metaJson: string | null;
  createdAt: string;
}

export interface FirmwarePinout {
  id: string;
  projectId: string;
  revisionId: string;
  /** MCU / connector refdes this pinout maps to */
  targetRefdes: string;
  dataJson: string;
  source: "schematic-sync" | "manual" | "upload";
  createdAt: string;
  updatedAt: string;
}

export interface SolderLabDb {
  users: User[];
  organizations: Organization[];
  memberships: Membership[];
  projects: Project[];
  branches: Branch[];
  revisions: Revision[];
  artifacts: Artifact[];
  designSnapshots: DesignSnapshotRow[];
  pcbSnapshots: PcbSnapshotRow[];
  bomLines: BomLineRow[];
  bomPlatformLines: BomPlatformLine[];
  diffBundles: DiffBundleRow[];
  designReviews: DesignReview[];
  comments: Comment[];
  checkRuns: CheckRun[];
  reviewApprovals: ReviewApproval[];
  sessions: Session[];
  libraryParts: LibraryPart[];
  releases: Release[];
  releaseArtifacts: ReleaseArtifact[];
  downloadAudits: DownloadAudit[];
  releaseShares: ReleaseShare[];
  releaseShareAudits: ReleaseShareAudit[];
  boardUnits: BoardUnit[];
  activityEvents: ActivityEvent[];
  webhooks: Webhook[];
  auditEvents: AuditEvent[];
  firmwarePinouts: FirmwarePinout[];
}

/** @deprecated Use SolderLabDb */
export type FluxDb = SolderLabDb;

export function emptyDb(): SolderLabDb {
  return {
    users: [],
    organizations: [],
    memberships: [],
    projects: [],
    branches: [],
    revisions: [],
    artifacts: [],
    designSnapshots: [],
    pcbSnapshots: [],
    bomLines: [],
    bomPlatformLines: [],
    diffBundles: [],
    designReviews: [],
    comments: [],
    checkRuns: [],
    reviewApprovals: [],
    sessions: [],
    libraryParts: [],
    releases: [],
    releaseArtifacts: [],
    downloadAudits: [],
    releaseShares: [],
    releaseShareAudits: [],
    boardUnits: [],
    activityEvents: [],
    webhooks: [],
    auditEvents: [],
    firmwarePinouts: [],
  };
}

export function normalizeRole(role: string): Role {
  if (role === "admin" || role === "owner") return "admin";
  if (role === "viewer") return "viewer";
  // engineer | reviewer | procurement | contributor → contributor
  return "contributor";
}
