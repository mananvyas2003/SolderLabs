export type FindingSeverity = "critical" | "high" | "medium" | "info";

export interface SnapshotPin {
  number: string;
  name: string;
  net: string;
}

export interface SnapshotComponent {
  refdes: string;
  value: string;
  footprint: string;
  mpn?: string;
  manufacturer?: string;
  libId?: string;
  sheetId: string;
  /**
   * Hierarchical sheet path using KiCad sheet-instance UUIDs,
   * e.g. `/rootUuid/childSheetUuid`. Used to disambiguate multi-instance
   * subsheets that share a symbol UUID in the child file.
   */
  sheetPath?: string;
  /**
   * KiCad symbol instance UUID from the s-expression `(uuid …)`.
   * Must be sourced from CAD — never minted by the parser.
   */
  uuid?: string;
  /** Set when lib_id could not be resolved via sym-lib-table / embedded libs. */
  libraryStatus?: "ok" | "unresolved";
  pins?: SnapshotPin[];
  /** Optional schematic symbol position for visual diff (mm or schematic units) */
  x?: number;
  y?: number;
  rotation?: number;
  /** Stable key: path of the owning `.kicad_pro` relative to the upload root. */
  boardKey?: string;
}

export interface SnapshotNet {
  name: string;
  /** Raw KiCad spelling when it differs from the canonical `name`. */
  displayName?: string;
  class?: "power" | "signal" | "ground" | string;
  nodes: string[];
  isNamed?: boolean;
  isPower?: boolean;
  /** Set when the snapshot contains multiple `.kicad_pro` roots. */
  boardKey?: string;
}

export interface SnapshotSheet {
  id: string;
  name: string;
  title?: string;
}

export type ParseWarningCode = "missing-sheet" | "pcb-only" | "multi-board";

export interface ParseWarning {
  code: ParseWarningCode;
  message: string;
}

export interface DesignSnapshot {
  schemaVersion: 1;
  tool: { name: string; version?: string };
  sheets: SnapshotSheet[];
  components: SnapshotComponent[];
  nets: SnapshotNet[];
  boards?: Array<{ key: string; name: string }>;
  warnings?: ParseWarning[];
  parseStatus?: "ok" | "partial";
  meta: {
    sheetCount: number;
    componentCount: number;
    netCount?: number;
    /** lib_id nicknames that were not resolvable on disk */
    unresolvedLibs?: string[];
    /** Primary .kicad_pro used when multiple projects exist in the tree */
    projectRoot?: string;
  };
}

export interface BomLineLike {
  refdes: string;
  value: string;
  footprint: string;
  mpn?: string;
  manufacturer?: string;
  qty?: number;
  /** Present when derived from a UUID-bearing schematic component */
  uuid?: string;
}

export type DiffChangeKind =
  | "added"
  | "removed"
  | "changed"
  | "unchanged"
  | "refdes_renamed"
  | "sheet_moved"
  | "net_renamed";

export type IdentityMatchTier = "uuid" | "sheet_refdes" | "refdes";

export interface ComponentDiff {
  /** Canonical (usually head) reference designator for display. */
  refdes: string;
  kind: DiffChangeKind;
  before?: SnapshotComponent;
  after?: SnapshotComponent;
  fields?: string[];
  /** Which identity tier resolved this pair (matched comps only). */
  matchTier?: IdentityMatchTier;
}

export interface BomDiffRow {
  refdes: string;
  kind: DiffChangeKind;
  before?: BomLineLike;
  after?: BomLineLike;
  fields?: string[];
}

export interface NetDiff {
  /** After rename: the new name; otherwise the net name. */
  name: string;
  kind: DiffChangeKind;
  beforeNodes?: string[];
  afterNodes?: string[];
  beforeName?: string;
  afterName?: string;
}

export interface PcbFootprint {
  refdes: string;
  footprint: string;
  x: number;
  y: number;
  rotation?: number;
  layer?: string;
}

export interface PcbTrack {
  layer: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface PcbSnapshot {
  schemaVersion: 1;
  outline: Array<{ x: number; y: number }>;
  footprints: PcbFootprint[];
  tracks: PcbTrack[];
  layers: string[];
  meta: {
    footprintCount: number;
    trackCount: number;
    widthMm?: number;
    heightMm?: number;
  };
}

export interface PcbFootprintDiff {
  refdes: string;
  kind: DiffChangeKind;
  before?: PcbFootprint;
  after?: PcbFootprint;
  fields?: string[];
}
