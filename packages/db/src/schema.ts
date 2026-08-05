export type Role =
  | "owner"
  | "admin"
  | "engineer"
  | "reviewer"
  | "viewer"
  | "procurement";

export type DataRegion =
  | "us-east"
  | "eu-west"
  | "ap-south"
  | "local";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  avatarUrl: string | null;
  ssoProvider: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  /** Data residency region for storage prefixing */
  dataRegion: DataRegion | string;
  ssoEnabled: boolean;
  ssoEntityId: string | null;
  ssoEntryUrl: string | null;
  ssoCertificate: string | null;
  ssoDomain: string | null;
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
  visibility: string; // private | internal | public
  defaultBranch: string;
  requireGreenChecks: boolean;
  requireApproval: boolean;
  starCount: number;
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
  createdAt: string;
  mergedAt: string | null;
}

export interface Comment {
  id: string;
  reviewId: string;
  authorId: string;
  body: string;
  parentId: string | null;
  anchorKind: string | null;
  anchorRef: string | null;
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

export interface DfmPartner {
  id: string;
  key: string;
  name: string;
  description: string;
  endpoint: string | null;
  capabilities: string[];
  active: boolean;
}

export interface DfmJob {
  id: string;
  orgId: string;
  projectId: string;
  releaseId: string;
  partnerKey: string;
  status: "queued" | "submitted" | "passed" | "failed" | "cancelled" | string;
  summary: string | null;
  detailsJson: string | null;
  externalId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStar {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
}

export interface FluxDb {
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
  diffBundles: DiffBundleRow[];
  designReviews: DesignReview[];
  comments: Comment[];
  checkRuns: CheckRun[];
  libraryParts: LibraryPart[];
  releases: Release[];
  releaseArtifacts: ReleaseArtifact[];
  downloadAudits: DownloadAudit[];
  activityEvents: ActivityEvent[];
  webhooks: Webhook[];
  auditEvents: AuditEvent[];
  firmwarePinouts: FirmwarePinout[];
  dfmPartners: DfmPartner[];
  dfmJobs: DfmJob[];
  projectStars: ProjectStar[];
}

export function defaultDfmPartners(): DfmPartner[] {
  return [
    {
      id: "dfm-jlc",
      key: "jlcpcb",
      name: "JLCPCB DFM",
      description: "Fabrication DFM: min trace/space, drill, annular ring heuristics",
      endpoint: null,
      capabilities: ["pcb-dfm", "assembly-bom"],
      active: true,
    },
    {
      id: "dfm-pcbway",
      key: "pcbway",
      name: "PCBWay DFM",
      description: "Board outline, copper-to-edge, silkscreen clearance checks",
      endpoint: null,
      capabilities: ["pcb-dfm"],
      active: true,
    },
    {
      id: "dfm-euro",
      key: "eurocircuits",
      name: "Eurocircuits DRC",
      description: "EU-hosted DFM partner profile (residency-aware routing)",
      endpoint: null,
      capabilities: ["pcb-dfm", "impedance-notes"],
      active: true,
    },
  ];
}

export function emptyDb(): FluxDb {
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
    diffBundles: [],
    designReviews: [],
    comments: [],
    checkRuns: [],
    libraryParts: [],
    releases: [],
    releaseArtifacts: [],
    downloadAudits: [],
    activityEvents: [],
    webhooks: [],
    auditEvents: [],
    firmwarePinouts: [],
    dfmPartners: defaultDfmPartners(),
    dfmJobs: [],
    projectStars: [],
  };
}
