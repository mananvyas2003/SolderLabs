"use client";

import dynamic from "next/dynamic";
import type { DiffBundleData, PcbSnapshot } from "@solderlab/design-core";
import { Badge } from "@solderlab/ui";
import { useMemo, useState } from "react";

const Board3D = dynamic(() => import("./board-3d"), { ssr: false });

export function PcbDiffViewer({ diff }: { diff: DiffBundleData }) {
  const [layer, setLayer] = useState<string>("F.Cu");
  const [overlay, setOverlay] = useState(0.55);
  const layers = useMemo(() => {
    const set = new Set<string>();
    for (const t of diff.pcbHead?.tracks ?? []) set.add(t.layer);
    for (const t of diff.pcbBase?.tracks ?? []) set.add(t.layer);
    if (!set.size) set.add("F.Cu");
    return [...set].sort();
  }, [diff]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 text-[var(--text-muted)]">
          Layer
          <select
            value={layer}
            onChange={(e) => setLayer(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1"
          >
            {layers.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[var(--text-muted)]">
          Overlay
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={overlay}
            onChange={(e) => setOverlay(Number(e.target.value))}
            className="w-40 accent-[var(--accent)]"
          />
        </label>
        <span className="text-[var(--text-muted)]">
          PCB +{diff.summary.pcbAdded ?? 0} / −{diff.summary.pcbRemoved ?? 0} / ~
          {diff.summary.pcbChanged ?? 0}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-[360px] border border-[var(--border)] bg-[var(--surface-1)]">
          <PcbLayerCanvas
            base={diff.pcbBase}
            head={diff.pcbHead}
            pcbDiff={diff.pcb ?? []}
            layer={layer}
            overlay={overlay}
          />
        </div>
        <div className="h-[360px] border border-[var(--border)] bg-[var(--surface-1)]">
          <Board3D
            base={diff.pcbBase}
            head={diff.pcbHead}
            pcbDiff={diff.pcb ?? []}
          />
        </div>
      </div>

      <ul className="grid gap-2 md:grid-cols-2">
        {(diff.pcb ?? []).map((p) => (
          <li
            key={p.refdes}
            className="flex items-center justify-between border border-[var(--border)] px-3 py-2 text-sm"
          >
            <span className="font-mono text-[var(--accent)]">{p.refdes}</span>
            <Badge
              tone={
                p.kind === "added"
                  ? "success"
                  : p.kind === "removed"
                    ? "danger"
                    : "warn"
              }
            >
              {p.kind}
              {p.fields ? `: ${p.fields.join(",")}` : ""}
            </Badge>
          </li>
        ))}
        {!diff.pcb?.length ? (
          <li className="text-sm text-[var(--text-muted)]">
            No PCB footprint deltas (or no .kicad_pcb in revisions).
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function PcbLayerCanvas({
  base,
  head,
  pcbDiff,
  layer,
  overlay,
}: {
  base?: PcbSnapshot | null;
  head?: PcbSnapshot | null;
  pcbDiff: NonNullable<DiffBundleData["pcb"]>;
  layer: string;
  overlay: number;
}) {
  const snap = head ?? base;
  if (!snap) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
        No PCB snapshot
      </div>
    );
  }
  const xs = snap.outline.map((p) => p.x);
  const ys = snap.outline.map((p) => p.y);
  const minX = Math.min(...xs) - 2;
  const minY = Math.min(...ys) - 2;
  const maxX = Math.max(...xs) + 2;
  const maxY = Math.max(...ys) + 2;
  const kindOf = (ref: string) =>
    pcbDiff.find((p) => p.refdes === ref)?.kind ?? "unchanged";

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="h-full w-full"
    >
      <polygon
        points={snap.outline.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="color-mix(in srgb, var(--accent) 8%, transparent)"
        stroke="var(--border)"
        strokeWidth={0.15}
      />
      {(base?.tracks ?? [])
        .filter((t) => t.layer === layer)
        .map((t, i) => (
          <line
            key={`b-${i}`}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke="var(--diff-del)"
            strokeWidth={t.width}
            opacity={1 - overlay}
          />
        ))}
      {(head?.tracks ?? [])
        .filter((t) => t.layer === layer)
        .map((t, i) => (
          <line
            key={`h-${i}`}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke="var(--diff-add)"
            strokeWidth={t.width}
            opacity={overlay}
          />
        ))}
      {snap.footprints.map((f) => {
        const kind = kindOf(f.refdes);
        const color =
          kind === "added"
            ? "var(--success)"
            : kind === "removed"
              ? "var(--danger)"
              : kind === "changed"
                ? "var(--accent-2)"
                : "var(--accent)";
        return (
          <g key={f.refdes}>
            <rect
              x={f.x - 1.2}
              y={f.y - 0.8}
              width={2.4}
              height={1.6}
              fill="none"
              stroke={color}
              strokeWidth={0.12}
            />
            <text
              x={f.x - 1.1}
              y={f.y - 1.1}
              fill={color}
              fontSize={0.9}
              fontFamily="var(--font-mono)"
            >
              {f.refdes}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
