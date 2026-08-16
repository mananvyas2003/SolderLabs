export const PART_DATA_PROVIDER = "PART_DATA_PROVIDER";
export const PART_DATA_API_KEY = "PART_DATA_API_KEY";
export const PART_DATA_BASE_URL = "PART_DATA_BASE_URL";

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_LEAD_TIME_WEEKS = 16;
export const DEFAULT_BUILD_QTY = 100;
export const DEFAULT_PRICE_CHANGE_PERCENT = 15;
export const DEFAULT_VOLUME_TIER_QTY = 100;

export type LifecycleStatus =
  | "active"
  | "nrnd"
  | "eol"
  | "obsolete"
  | "unknown";

export interface PriceBreak {
  qty: number;
  unitPrice: number;
}

export interface PartData {
  mpn: string;
  manufacturer: string | null;
  lifecycleStatus: LifecycleStatus;
  lastTimeBuyDate: string | null;
  leadTimeWeeks: number | null;
  stockTotal: number | null;
  priceBreaks: PriceBreak[];
}

export type PartDataFailureReason = "http_error" | "malformed";

export type PartDataResult =
  | { ok: true; data: PartData }
  | {
      ok: false;
      mpn: string;
      reason: PartDataFailureReason;
      message: string;
      httpStatus?: number;
    };

export interface PartDataProvider {
  lookup(mpns: string[]): Promise<PartDataResult[]>;
}

export const END_OF_LIFE_STATUSES = new Set<LifecycleStatus>([
  "nrnd",
  "eol",
  "obsolete",
]);

export function normalizeMpn(mpn: string): string {
  return mpn.trim();
}

export function parseLifecycle(raw: unknown): LifecycleStatus | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (v === "active" || v === "volume production" || v === "new") return "active";
  if (v === "nrnd" || v.includes("not recommended")) return "nrnd";
  if (v === "eol" || v.includes("end of life")) return "eol";
  if (v === "obsolete" || v === "obsolete last time buy") return "obsolete";
  if (v === "unknown") return "unknown";
  return null;
}
