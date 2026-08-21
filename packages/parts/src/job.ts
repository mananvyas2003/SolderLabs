import { nanoid } from "nanoid";
import type { OrgSupplySettings, PartAlert, PartWatch, SolderLabDb } from "@solderlab/db";
import { collectOrgMpns } from "./collect.ts";
import { notifyPartAlerts } from "./notify.ts";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_BUILD_QTY,
  DEFAULT_LEAD_TIME_WEEKS,
  DEFAULT_PRICE_CHANGE_PERCENT,
  DEFAULT_VOLUME_TIER_QTY,
  END_OF_LIFE_STATUSES,
  type LifecycleStatus,
  type PartData,
  type PartDataProvider,
  type PartDataResult,
  type PriceBreak,
} from "./types.ts";

export interface WatchJobOptions {
  provider: PartDataProvider;
  persist: () => void;
  nowIso: () => string;
  orgIds?: string[];
  batchSize?: number;
  delayMs?: number;
  /** Share lookup results across orgs (nexar). Off for per-org manual catalogs. */
  shareLookups?: boolean;
  log?: (msg: string, extra?: unknown) => void;
}

export interface WatchJobStats {
  requestCount: number;
  batchSize: number;
  orgs: number;
  mpnsLookedUp: number;
  alertsCreated: number;
  httpFailures: number;
  malformed: number;
  startedAt: string;
}

function settingsFor(db: SolderLabDb, orgId: string): OrgSupplySettings {
  let row = db.orgSupplySettings.find((s) => s.orgId === orgId);
  if (!row) {
    row = {
      id: orgId,
      orgId,
      leadTimeWeeksThreshold: DEFAULT_LEAD_TIME_WEEKS,
      buildQty: DEFAULT_BUILD_QTY,
      priceChangePercent: DEFAULT_PRICE_CHANGE_PERCENT,
      volumeTierQty: DEFAULT_VOLUME_TIER_QTY,
    };
    db.orgSupplySettings.push(row);
  }
  return row;
}

function priceAt(breaks: PriceBreak[], qty: number): number | null {
  if (!breaks.length) return null;
  const eligible = breaks
    .filter((b) => b.qty <= qty)
    .sort((a, b) => b.qty - a.qty);
  if (eligible[0]) return eligible[0].unitPrice;
  return [...breaks].sort((a, b) => a.qty - b.qty)[0]!.unitPrice;
}

function upsertAlert(
  db: SolderLabDb,
  input: Omit<PartAlert, "id"> & { id?: string },
): PartAlert {
  const existing = db.partAlerts.find(
    (a) =>
      a.orgId === input.orgId &&
      a.mpn === input.mpn &&
      a.kind === input.kind &&
      !a.acknowledgedBy,
  );
  if (existing) {
    for (const pid of input.affectedProjects) {
      if (!existing.affectedProjects.includes(pid)) {
        existing.affectedProjects.push(pid);
      }
    }
    existing.detail = input.detail;
    existing.severity = input.severity;
    existing.detectedAt = input.detectedAt;
    return existing;
  }
  const row: PartAlert = {
    id: input.id ?? nanoid(),
    orgId: input.orgId,
    mpn: input.mpn,
    kind: input.kind,
    severity: input.severity,
    detectedAt: input.detectedAt,
    acknowledgedBy: input.acknowledgedBy,
    affectedProjects: [...input.affectedProjects],
    detail: input.detail,
  };
  db.partAlerts.push(row);
  return row;
}

async function lookupBatched(
  provider: PartDataProvider,
  mpns: string[],
  batchSize: number,
  delayMs: number,
  stats: WatchJobStats,
  cache: Map<string, PartDataResult>,
): Promise<void> {
  const pending = mpns.filter((m) => !cache.has(m.toUpperCase()));
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    stats.requestCount += 1;
    const results = await provider.lookup(batch);
    if (results.length !== batch.length) {
      stats.malformed += 1;
      for (const mpn of batch) {
        cache.set(mpn.toUpperCase(), {
          ok: false,
          mpn,
          reason: "malformed",
          message: `provider returned ${results.length} rows for ${batch.length} MPNs`,
        });
      }
    } else {
      for (const r of results) {
        cache.set(r.ok ? r.data.mpn.toUpperCase() : r.mpn.toUpperCase(), r);
      }
    }
    if (delayMs > 0 && i + batchSize < pending.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function applySuccess(
  watch: PartWatch,
  data: PartData,
  now: string,
  providerName: string,
): void {
  watch.manufacturer = data.manufacturer ?? watch.manufacturer;
  watch.lifecycleStatus = data.lifecycleStatus;
  watch.lastTimeBuyDate = data.lastTimeBuyDate;
  watch.leadTimeWeeks = data.leadTimeWeeks;
  watch.stockTotal = data.stockTotal;
  watch.priceBreaks = data.priceBreaks;
  watch.lastCheckedAt = now;
  watch.sourceProvider = providerName;
  watch.lastError = null;
}

export async function runPartWatchJob(
  db: SolderLabDb,
  opts: WatchJobOptions,
): Promise<WatchJobStats> {
  const startedAt = opts.nowIso();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const delayMs = opts.delayMs ?? 200;
  const share = opts.shareLookups ?? true;
  const log = opts.log ?? ((msg, extra) => console.error(msg, extra ?? ""));
  const stats: WatchJobStats = {
    requestCount: 0,
    batchSize,
    orgs: 0,
    mpnsLookedUp: 0,
    alertsCreated: 0,
    httpFailures: 0,
    malformed: 0,
    startedAt,
  };
  const globalCache = new Map<string, PartDataResult>();
  const orgIds =
    opts.orgIds ?? [...new Set(db.organizations.map((o) => o.id))];
  const providerName = process.env.PART_DATA_PROVIDER ?? "nexar";
  const alertsBefore = db.partAlerts.length;

  for (const orgId of orgIds) {
    stats.orgs += 1;
    const usages = collectOrgMpns(db, orgId);
    const cache = share ? globalCache : new Map<string, PartDataResult>();
    const mpns = usages.map((u) => u.mpn);
    stats.mpnsLookedUp += mpns.filter((m) => !cache.has(m.toUpperCase())).length;
    await lookupBatched(
      opts.provider,
      mpns,
      batchSize,
      delayMs,
      stats,
      cache,
    );

    const settings = settingsFor(db, orgId);
    for (const usage of usages) {
      const key = usage.mpn.toUpperCase();
      let watch = db.partWatches.find(
        (w) => w.orgId === orgId && w.mpn.toUpperCase() === key,
      );
      if (!watch) {
        watch = {
          id: nanoid(),
          orgId,
          mpn: usage.mpn,
          manufacturer: usage.manufacturer,
          usedIn: usage.projectIds,
          lifecycleStatus: "unknown",
          lastTimeBuyDate: null,
          leadTimeWeeks: null,
          stockTotal: null,
          priceBreaks: [],
          lastCheckedAt: null,
          sourceProvider: providerName,
          lastError: null,
        };
        db.partWatches.push(watch);
      }
      watch.usedIn = usage.projectIds;
      const prevLife = watch.lifecycleStatus;
      const prevPrice = priceAt(watch.priceBreaks, settings.volumeTierQty);
      const result = cache.get(key);
      if (!result) continue;

      if (!result.ok && result.reason === "malformed") {
        stats.malformed += 1;
        log(`part-watch malformed payload for ${usage.mpn}`, result.message);
        continue;
      }
      if (!result.ok && result.reason === "http_error") {
        stats.httpFailures += 1;
        watch.lifecycleStatus = "unknown";
        watch.lastError = result.message;
        continue;
      }
      if (!result.ok) continue;

      const data = result.data;
      applySuccess(watch, data, startedAt, providerName);

      if (END_OF_LIFE_STATUSES.has(data.lifecycleStatus)) {
        upsertAlert(db, {
          orgId,
          mpn: usage.mpn,
          kind: "lifecycle",
          severity: "critical",
          detectedAt: startedAt,
          acknowledgedBy: null,
          affectedProjects: usage.projectIds,
          detail: `Lifecycle ${prevLife} → ${data.lifecycleStatus}`,
        });
      }
      if (
        data.leadTimeWeeks != null &&
        data.leadTimeWeeks > settings.leadTimeWeeksThreshold
      ) {
        upsertAlert(db, {
          orgId,
          mpn: usage.mpn,
          kind: "lead_time",
          severity: "warning",
          detectedAt: startedAt,
          acknowledgedBy: null,
          affectedProjects: usage.projectIds,
          detail: `Lead time ${data.leadTimeWeeks} weeks exceeds ${settings.leadTimeWeeksThreshold}`,
        });
      }
      if (data.stockTotal != null && data.stockTotal < settings.buildQty) {
        upsertAlert(db, {
          orgId,
          mpn: usage.mpn,
          kind: "stock",
          severity: "warning",
          detectedAt: startedAt,
          acknowledgedBy: null,
          affectedProjects: usage.projectIds,
          detail: `Stock ${data.stockTotal} below build qty ${settings.buildQty}`,
        });
      }
      const nextPrice = priceAt(data.priceBreaks, settings.volumeTierQty);
      if (prevPrice != null && nextPrice != null && prevPrice > 0) {
        const delta = Math.abs(nextPrice - prevPrice) / prevPrice;
        if (delta * 100 >= settings.priceChangePercent) {
          upsertAlert(db, {
            orgId,
            mpn: usage.mpn,
            kind: "price",
            severity: "info",
            detectedAt: startedAt,
            acknowledgedBy: null,
            affectedProjects: usage.projectIds,
            detail: `Price at qty ${settings.volumeTierQty} changed ${(delta * 100).toFixed(1)}% (${prevPrice} → ${nextPrice})`,
          });
        }
      }
    }
    opts.persist();
    const fresh = db.partAlerts.filter(
      (a) => a.orgId === orgId && a.detectedAt === startedAt,
    );
    await notifyPartAlerts({
      db,
      orgId,
      alerts: fresh,
      nowIso: startedAt,
      persist: opts.persist,
    });
  }

  stats.alertsCreated = db.partAlerts.length - alertsBefore;
  return stats;
}

export function watchIsStale(watch: PartWatch, nowMs: number, maxAgeMs = 36 * 3600 * 1000): boolean {
  if (watch.lifecycleStatus === "unknown") return true;
  if (!watch.lastCheckedAt) return true;
  return nowMs - new Date(watch.lastCheckedAt).getTime() > maxAgeMs;
}

export type { LifecycleStatus };
