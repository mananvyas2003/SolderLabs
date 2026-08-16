import type { PartDataProvider, PartDataResult } from "./types.ts";
import { PART_DATA_API_KEY, PART_DATA_BASE_URL, parseLifecycle } from "./types.ts";

function nexarLifecycle(part: Record<string, unknown>): ReturnType<typeof parseLifecycle> {
  const direct = parseLifecycle(part.lifecycleStatus ?? part.lifecycle);
  if (direct) return direct;
  const flags = [
    part.obsolete,
    part.isObsolete,
    part.endOfLife,
    part.isEndOfLife,
  ];
  if (flags.some((f) => f === true)) return "obsolete";
  return parseLifecycle(typeof part.category === "object" && part.category
    ? (part.category as { name?: string }).name
    : null);
}

/**
 * Nexar / Octopart-style GraphQL batch: one HTTP request per MPN batch.
 * Never infers lifecycle "active" from a missing field.
 */
export class NexarPartDataProvider implements PartDataProvider {
  constructor(
    private readonly opts: {
      apiKey: string | undefined;
      baseUrl: string | undefined;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async lookup(mpns: string[]): Promise<PartDataResult[]> {
    const key = this.opts.apiKey ?? process.env[PART_DATA_API_KEY];
    const base = (this.opts.baseUrl ?? process.env[PART_DATA_BASE_URL] ?? "").replace(
      /\/$/,
      "",
    );
    if (!key || !base) {
      return mpns.map((mpn) => ({
        ok: false as const,
        mpn,
        reason: "http_error" as const,
        message: `${PART_DATA_API_KEY} or ${PART_DATA_BASE_URL} is not configured`,
      }));
    }

    const aliases = mpns.map((mpn, i) => {
      const q = mpn.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `p${i}: supSearchMpn(q: "${q}", limit: 1) { results { part { mpn manufacturer { name } lifecycleStatus estimatedFactoryLeadDays medianPrice100 factoryLeadDays } } }`;
    });
    const query = `query { ${aliases.join("\n")} }`;
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await fetchImpl(`${base}/graphql`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ query }),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return mpns.map((mpn) => ({
        ok: false as const,
        mpn,
        reason: "http_error" as const,
        message,
      }));
    }

    const text = await res.text();
    if (!res.ok) {
      return mpns.map((mpn) => ({
        ok: false as const,
        mpn,
        reason: "http_error" as const,
        message: `provider HTTP ${res.status}: ${text.slice(0, 200)}`,
        httpStatus: res.status,
      }));
    }

    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return mpns.map((mpn) => ({
        ok: false as const,
        mpn,
        reason: "malformed" as const,
        message: "provider response was not JSON",
      }));
    }

    if (!body || typeof body !== "object" || !("data" in body)) {
      return mpns.map((mpn) => ({
        ok: false as const,
        mpn,
        reason: "malformed" as const,
        message: "provider JSON missing data",
      }));
    }

    const data = (body as { data: Record<string, unknown> }).data;
    if (!data || typeof data !== "object") {
      return mpns.map((mpn) => ({
        ok: false as const,
        mpn,
        reason: "malformed" as const,
        message: "provider data was not an object",
      }));
    }

    return mpns.map((mpn, i) => {
      const node = data[`p${i}`];
      if (node == null) {
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
      const results = (node as { results?: unknown[] }).results;
      if (!Array.isArray(results)) {
        return {
          ok: false as const,
          mpn,
          reason: "malformed" as const,
          message: `malformed results for ${mpn}`,
        };
      }
      const part = (results[0] as { part?: Record<string, unknown> } | undefined)
        ?.part;
      if (!part) {
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
      const life = nexarLifecycle(part);
      const leadDays =
        typeof part.estimatedFactoryLeadDays === "number"
          ? part.estimatedFactoryLeadDays
          : typeof part.factoryLeadDays === "number"
            ? part.factoryLeadDays
            : null;
      const mfr =
        part.manufacturer && typeof part.manufacturer === "object"
          ? ((part.manufacturer as { name?: string }).name ?? null)
          : null;
      const median =
        typeof part.medianPrice100 === "number" ? part.medianPrice100 : null;
      return {
        ok: true as const,
        data: {
          mpn: typeof part.mpn === "string" ? part.mpn : mpn,
          manufacturer: mfr,
          lifecycleStatus: life ?? "unknown",
          lastTimeBuyDate: null,
          leadTimeWeeks: leadDays != null ? leadDays / 7 : null,
          stockTotal: null,
          priceBreaks:
            median != null ? [{ qty: 100, unitPrice: median }] : [],
        },
      };
    });
  }
}
