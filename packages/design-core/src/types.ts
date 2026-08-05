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
  pins?: SnapshotPin[];
  /** Optional schematic symbol position for visual diff (mm or schematic units) */
  x?: number;
  y?: number;
  rotation?: number;
}

export interface SnapshotNet {
  name: string;
  class?: "power" | "signal" | "ground" | string;
  nodes: string[];
  isNamed?: boolean;
  isPower?: boolean;
}

export interface SnapshotSheet {
  id: string;
  name: string;
  title?: string;
}

export interface DesignSnapshot {
  schemaVersion: 1;
  tool: { name: string; version?: string };
  sheets: SnapshotSheet[];
  components: SnapshotComponent[];
  nets: SnapshotNet[];
  meta: {
    sheetCount: number;
    componentCount: number;
    netCount?: number;
  };
}

export interface BomLineLike {
  refdes: string;
  value: string;
  footprint: string;
  mpn?: string;
  manufacturer?: string;
  qty?: number;
}

export type DiffChangeKind = "added" | "removed" | "changed" | "unchanged";

export interface ComponentDiff {
  refdes: string;
  kind: DiffChangeKind;
  before?: SnapshotComponent;
  after?: SnapshotComponent;
  fields?: string[];
}

export interface BomDiffRow {
  refdes: string;
  kind: DiffChangeKind;
  before?: BomLineLike;
  after?: BomLineLike;
  fields?: string[];
}

export interface NetDiff {
  name: string;
  kind: DiffChangeKind;
  beforeNodes?: string[];
  afterNodes?: string[];
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
