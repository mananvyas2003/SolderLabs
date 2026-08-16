/** DDL for the SolderLab SQLite store. Indexes cover request-path lookups. */

export const SQLITE_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 8000;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  passwordHash TEXT,
  avatarUrl TEXT,
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  tokenHash TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_tokenHash ON sessions(tokenHash);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  userId TEXT NOT NULL,
  role TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memberships_orgId ON memberships(orgId);
CREATE INDEX IF NOT EXISTS idx_memberships_userId ON memberships(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_org_user ON memberships(orgId, userId);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL,
  defaultBranch TEXT NOT NULL,
  requireGreenChecks INTEGER NOT NULL,
  requireApproval INTEGER NOT NULL,
  requiredApprovals INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_orgId ON projects(orgId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_slug ON projects(orgId, slug);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  name TEXT NOT NULL,
  headRevisionId TEXT
);
CREATE INDEX IF NOT EXISTS idx_branches_projectId ON branches(projectId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_project_name ON branches(projectId, name);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  branchId TEXT,
  parentRevisionId TEXT,
  message TEXT NOT NULL,
  authorId TEXT NOT NULL,
  parseStatus TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_projectId ON revisions(projectId);
CREATE INDEX IF NOT EXISTS idx_revisions_branchId ON revisions(branchId);
CREATE INDEX IF NOT EXISTS idx_revisions_authorId ON revisions(authorId);
CREATE INDEX IF NOT EXISTS idx_revisions_parentRevisionId ON revisions(parentRevisionId);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  revisionId TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  storageKey TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_revisionId ON artifacts(revisionId);

CREATE TABLE IF NOT EXISTS designSnapshots (
  id TEXT PRIMARY KEY,
  revisionId TEXT NOT NULL,
  schemaVersion INTEGER NOT NULL,
  dataJson TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_designSnapshots_revisionId ON designSnapshots(revisionId);

CREATE TABLE IF NOT EXISTS pcbSnapshots (
  id TEXT PRIMARY KEY,
  revisionId TEXT NOT NULL,
  schemaVersion INTEGER NOT NULL,
  dataJson TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pcbSnapshots_revisionId ON pcbSnapshots(revisionId);

CREATE TABLE IF NOT EXISTS bomLines (
  id TEXT PRIMARY KEY,
  revisionId TEXT NOT NULL,
  refdes TEXT NOT NULL,
  value TEXT NOT NULL,
  footprint TEXT NOT NULL,
  mpn TEXT,
  manufacturer TEXT,
  qty INTEGER NOT NULL,
  attrsJson TEXT
);
CREATE INDEX IF NOT EXISTS idx_bomLines_revisionId ON bomLines(revisionId);

CREATE TABLE IF NOT EXISTS bomPlatformLines (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  uuid TEXT,
  refdes TEXT NOT NULL,
  mpn TEXT,
  manufacturer TEXT,
  alternateMpnsJson TEXT,
  dnp INTEGER NOT NULL,
  notes TEXT,
  lockedValue TEXT,
  lockedFootprint TEXT,
  updatedAt TEXT NOT NULL,
  updatedBy TEXT
);
CREATE INDEX IF NOT EXISTS idx_bomPlatformLines_projectId ON bomPlatformLines(projectId);
CREATE INDEX IF NOT EXISTS idx_bomPlatformLines_refdes ON bomPlatformLines(projectId, refdes);

CREATE TABLE IF NOT EXISTS diffBundles (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  baseRevisionId TEXT NOT NULL,
  headRevisionId TEXT NOT NULL,
  dataJson TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_diffBundles_projectId ON diffBundles(projectId);
CREATE INDEX IF NOT EXISTS idx_diffBundles_pair ON diffBundles(projectId, baseRevisionId, headRevisionId);

CREATE TABLE IF NOT EXISTS designReviews (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  baseRevisionId TEXT NOT NULL,
  headRevisionId TEXT NOT NULL,
  state TEXT NOT NULL,
  authorId TEXT NOT NULL,
  targetBranchId TEXT,
  createdAt TEXT NOT NULL,
  mergedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_designReviews_projectId ON designReviews(projectId);
CREATE INDEX IF NOT EXISTS idx_designReviews_headRevisionId ON designReviews(headRevisionId);
CREATE INDEX IF NOT EXISTS idx_designReviews_authorId ON designReviews(authorId);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  reviewId TEXT NOT NULL,
  authorId TEXT NOT NULL,
  body TEXT NOT NULL,
  parentId TEXT,
  anchorKind TEXT,
  anchorRef TEXT,
  anchorUuid TEXT,
  anchorMetaJson TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_reviewId ON comments(reviewId);
CREATE INDEX IF NOT EXISTS idx_comments_authorId ON comments(authorId);
CREATE INDEX IF NOT EXISTS idx_comments_parentId ON comments(parentId);

CREATE TABLE IF NOT EXISTS checkRuns (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  reviewId TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT,
  summary TEXT,
  detailsJson TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkRuns_projectId ON checkRuns(projectId);
CREATE INDEX IF NOT EXISTS idx_checkRuns_revisionId ON checkRuns(revisionId);
CREATE INDEX IF NOT EXISTS idx_checkRuns_reviewId ON checkRuns(reviewId);

CREATE TABLE IF NOT EXISTS reviewApprovals (
  id TEXT PRIMARY KEY,
  reviewId TEXT NOT NULL,
  userId TEXT NOT NULL,
  state TEXT NOT NULL,
  headRevisionSha TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviewApprovals_reviewId ON reviewApprovals(reviewId);
CREATE INDEX IF NOT EXISTS idx_reviewApprovals_userId ON reviewApprovals(userId);

CREATE TABLE IF NOT EXISTS libraryParts (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  mpn TEXT NOT NULL,
  manufacturer TEXT,
  footprint TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  alternatesJson TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_libraryParts_orgId ON libraryParts(orgId);
CREATE INDEX IF NOT EXISTS idx_libraryParts_mpn ON libraryParts(orgId, mpn);

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  tag TEXT NOT NULL,
  title TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  notes TEXT,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  immutable INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_releases_projectId ON releases(projectId);
CREATE INDEX IF NOT EXISTS idx_releases_revisionId ON releases(revisionId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_releases_project_tag ON releases(projectId, tag);

CREATE TABLE IF NOT EXISTS releaseArtifacts (
  id TEXT PRIMARY KEY,
  releaseId TEXT NOT NULL,
  path TEXT NOT NULL,
  storageKey TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_releaseArtifacts_releaseId ON releaseArtifacts(releaseId);

CREATE TABLE IF NOT EXISTS downloadAudits (
  id TEXT PRIMARY KEY,
  releaseId TEXT NOT NULL,
  userId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_downloadAudits_releaseId ON downloadAudits(releaseId);
CREATE INDEX IF NOT EXISTS idx_downloadAudits_userId ON downloadAudits(userId);

CREATE TABLE IF NOT EXISTS releaseShares (
  id TEXT PRIMARY KEY,
  releaseId TEXT NOT NULL,
  token TEXT NOT NULL,
  label TEXT NOT NULL,
  allowGerbers INTEGER NOT NULL,
  allowBom INTEGER NOT NULL,
  allowCad INTEGER NOT NULL,
  watermark TEXT,
  expiresAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  revokedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_releaseShares_releaseId ON releaseShares(releaseId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_releaseShares_token ON releaseShares(token);

CREATE TABLE IF NOT EXISTS releaseShareAudits (
  id TEXT PRIMARY KEY,
  shareId TEXT NOT NULL,
  action TEXT NOT NULL,
  metaJson TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_releaseShareAudits_shareId ON releaseShareAudits(shareId);

CREATE TABLE IF NOT EXISTS boardUnits (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  serial TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  notes TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boardUnits_projectId ON boardUnits(projectId);
CREATE INDEX IF NOT EXISTS idx_boardUnits_revisionId ON boardUnits(revisionId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_boardUnits_serial ON boardUnits(projectId, serial);

CREATE TABLE IF NOT EXISTS activityEvents (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  projectId TEXT,
  actorId TEXT,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  metaJson TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activityEvents_orgId ON activityEvents(orgId);
CREATE INDEX IF NOT EXISTS idx_activityEvents_projectId ON activityEvents(projectId);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  eventsJson TEXT NOT NULL,
  active INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_orgId ON webhooks(orgId);

CREATE TABLE IF NOT EXISTS auditEvents (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  actorId TEXT,
  action TEXT NOT NULL,
  targetType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  metaJson TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auditEvents_orgId ON auditEvents(orgId);

CREATE TABLE IF NOT EXISTS firmwarePinouts (
  id TEXT PRIMARY KEY,
  projectId TEXT NOT NULL,
  revisionId TEXT NOT NULL,
  targetRefdes TEXT NOT NULL,
  dataJson TEXT NOT NULL,
  source TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_firmwarePinouts_projectId ON firmwarePinouts(projectId);
CREATE INDEX IF NOT EXISTS idx_firmwarePinouts_revisionId ON firmwarePinouts(revisionId);

CREATE TABLE IF NOT EXISTS partWatches (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  mpn TEXT NOT NULL,
  manufacturer TEXT,
  usedInJson TEXT NOT NULL,
  lifecycleStatus TEXT NOT NULL,
  lastTimeBuyDate TEXT,
  leadTimeWeeks REAL,
  stockTotal REAL,
  priceBreaksJson TEXT NOT NULL,
  lastCheckedAt TEXT,
  sourceProvider TEXT NOT NULL,
  lastError TEXT
);
CREATE INDEX IF NOT EXISTS idx_partWatches_orgId ON partWatches(orgId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partWatches_org_mpn ON partWatches(orgId, mpn);

CREATE TABLE IF NOT EXISTS partAlerts (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  mpn TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  detectedAt TEXT NOT NULL,
  acknowledgedBy TEXT,
  affectedProjectsJson TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partAlerts_orgId ON partAlerts(orgId);
CREATE INDEX IF NOT EXISTS idx_partAlerts_mpn ON partAlerts(orgId, mpn);
CREATE INDEX IF NOT EXISTS idx_partAlerts_kind ON partAlerts(orgId, mpn, kind);

CREATE TABLE IF NOT EXISTS orgSupplySettings (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  leadTimeWeeksThreshold INTEGER NOT NULL,
  buildQty INTEGER NOT NULL,
  priceChangePercent REAL NOT NULL,
  volumeTierQty INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgSupplySettings_orgId ON orgSupplySettings(orgId);

CREATE TABLE IF NOT EXISTS manualPartCatalog (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  mpn TEXT NOT NULL,
  manufacturer TEXT,
  lifecycleStatus TEXT NOT NULL,
  lastTimeBuyDate TEXT,
  leadTimeWeeks REAL,
  stockTotal REAL,
  priceBreaksJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manualPartCatalog_orgId ON manualPartCatalog(orgId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_manualPartCatalog_org_mpn ON manualPartCatalog(orgId, mpn);

CREATE TABLE IF NOT EXISTS emailOutbox (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL,
  toAddressesJson TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  sentAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_emailOutbox_orgId ON emailOutbox(orgId);
`;

export const TABLE_NAMES = [
  "users",
  "sessions",
  "organizations",
  "memberships",
  "projects",
  "branches",
  "revisions",
  "artifacts",
  "designSnapshots",
  "pcbSnapshots",
  "bomLines",
  "bomPlatformLines",
  "diffBundles",
  "designReviews",
  "comments",
  "checkRuns",
  "reviewApprovals",
  "libraryParts",
  "releases",
  "releaseArtifacts",
  "downloadAudits",
  "releaseShares",
  "releaseShareAudits",
  "boardUnits",
  "activityEvents",
  "webhooks",
  "auditEvents",
  "firmwarePinouts",
  "partWatches",
  "partAlerts",
  "orgSupplySettings",
  "manualPartCatalog",
  "emailOutbox",
] as const;

export type TableName = (typeof TABLE_NAMES)[number];
