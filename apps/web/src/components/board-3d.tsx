"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { DiffBundleData, PcbSnapshot } from "@solderlab/design-core";

export default function Board3D({
  base,
  head,
  pcbDiff,
}: {
  base?: PcbSnapshot | null;
  head?: PcbSnapshot | null;
  pcbDiff: NonNullable<DiffBundleData["pcb"]>;
}) {
  const snap = head ?? base;
  if (!snap) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
        No 3D board data
      </div>
    );
  }

  const xs = snap.outline.map((p) => p.x);
  const ys = snap.outline.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const kindOf = (ref: string) =>
    pcbDiff.find((p) => p.refdes === ref)?.kind ?? "unchanged";

  return (
    <Canvas camera={{ position: [0, 40, 40], fov: 35 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 40, 10]} intensity={1.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <boxGeometry args={[w, h, 1.2]} />
        <meshStandardMaterial color="#3f3f46" metalness={0.2} roughness={0.55} />
      </mesh>
      {snap.footprints.map((f) => {
        const kind = kindOf(f.refdes);
        const color =
          kind === "added"
            ? "#15803d"
            : kind === "removed"
              ? "#b91c1c"
              : kind === "changed"
                ? "#a16207"
                : "#c2410c";
        return (
          <mesh
            key={f.refdes}
            position={[f.x - cx, 1, f.y - cy]}
            rotation={[0, ((f.rotation ?? 0) * Math.PI) / 180, 0]}
          >
            <boxGeometry args={[2.2, 0.8, 1.4]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
      <OrbitControls enablePan makeDefault />
    </Canvas>
  );
}
