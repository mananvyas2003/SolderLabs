import type { DiffBundleData } from "@solderlab/design-core";

export type PaginatedDiff = Omit<DiffBundleData, "pcbBase" | "pcbHead"> & {
  page: {
    limit: number;
    componentsOffset: number;
    netsOffset: number;
    electricalOffset: number;
    pcbOffset: number;
    componentsTotal: number;
    netsTotal: number;
    electricalTotal: number;
    pcbTotal: number;
    truncated: boolean;
  };
};

export function paginateDiff(
  data: DiffBundleData,
  opts: {
    limit: number;
    componentsOffset: number;
    netsOffset: number;
    electricalOffset: number;
    pcbOffset: number;
  },
): PaginatedDiff {
  const { pcbBase: _b, pcbHead: _h, ...rest } = data;
  const electricalChanges = data.electrical?.changes ?? [];
  const pcb = data.pcb ?? [];
  const componentsTotal = data.components.length;
  const netsTotal = data.nets.length;
  const electricalTotal = electricalChanges.length;
  const pcbTotal = pcb.length;
  const { limit, componentsOffset, netsOffset, electricalOffset, pcbOffset } =
    opts;

  return {
    ...rest,
    components: data.components.slice(
      componentsOffset,
      componentsOffset + limit,
    ),
    nets: data.nets.slice(netsOffset, netsOffset + limit),
    pcb: pcb.slice(pcbOffset, pcbOffset + limit),
    electrical: data.electrical
      ? {
          ...data.electrical,
          changes: electricalChanges.slice(
            electricalOffset,
            electricalOffset + limit,
          ),
        }
      : undefined,
    page: {
      limit,
      componentsOffset,
      netsOffset,
      electricalOffset,
      pcbOffset,
      componentsTotal,
      netsTotal,
      electricalTotal,
      pcbTotal,
      truncated:
        componentsOffset + limit < componentsTotal ||
        netsOffset + limit < netsTotal ||
        electricalOffset + limit < electricalTotal ||
        pcbOffset + limit < pcbTotal,
    },
  };
}
