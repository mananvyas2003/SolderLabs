import type { LifecycleStatus, PartDataProvider, PartDataResult, PriceBreak } from "./types.ts";
import { parseLifecycle } from "./types.ts";

export interface ManualCatalogEntry {
  mpn: string;
  manufacturer?: string | null;
  lifecycleStatus?: string;
  lastTimeBuyDate?: string | null;
  leadTimeWeeks?: number | null;
  stockTotal?: number | null;
  priceBreaks?: PriceBreak[];
}

export function parsePartCsv(text: string): ManualCatalogEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  if (!lines.length) return [];
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const out: ManualCatalogEntry[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const mpn = cols[idx("mpn")] ?? cols[0];
    if (!mpn) continue;
    const lifeRaw = cols[idx("lifecycle")] ?? cols[idx("lifecyclestatus")];
    const qty = Number(cols[idx("priceqty")]);
    const price = Number(cols[idx("unitprice")]);
    const breaks: PriceBreak[] =
      Number.isFinite(qty) && Number.isFinite(price)
        ? [{ qty, unitPrice: price }]
        : [];
    out.push({
      mpn,
      manufacturer: cols[idx("manufacturer")] || null,
      lifecycleStatus: lifeRaw,
      lastTimeBuyDate: cols[idx("lasttimebuydate")] || null,
      leadTimeWeeks: Number(cols[idx("leadtimeweeks")]) || null,
      stockTotal: Number(cols[idx("stocktotal")]) || null,
      priceBreaks: breaks,
    });
  }
  return out;
}

export class ManualPartDataProvider implements PartDataProvider {
  private readonly byMpn: Map<string, ManualCatalogEntry>;

  constructor(rows: ManualCatalogEntry[]) {
    this.byMpn = new Map(rows.map((r) => [r.mpn.trim().toUpperCase(), r]));
  }

  async lookup(mpns: string[]): Promise<PartDataResult[]> {
    return mpns.map((mpn) => {
      const row = this.byMpn.get(mpn.trim().toUpperCase());
      if (!row) {
        return {
          ok: true as const,
          data: {
            mpn,
            manufacturer: null,
            lifecycleStatus: "unknown" as const,
            lastTimeBuyDate: null,
            leadTimeWeeks: null,
            stockTotal: null,
            priceBreaks: [],
          },
        };
      }
      const life = parseLifecycle(row.lifecycleStatus);
      if (row.lifecycleStatus && life == null) {
        return {
          ok: false as const,
          mpn,
          reason: "malformed" as const,
          message: `unrecognized lifecycle "${row.lifecycleStatus}"`,
        };
      }
      return {
        ok: true as const,
        data: {
          mpn,
          manufacturer: row.manufacturer ?? null,
          lifecycleStatus: (life ?? "unknown") as LifecycleStatus,
          lastTimeBuyDate: row.lastTimeBuyDate ?? null,
          leadTimeWeeks: row.leadTimeWeeks ?? null,
          stockTotal: row.stockTotal ?? null,
          priceBreaks: row.priceBreaks ?? [],
        },
      };
    });
  }
}
