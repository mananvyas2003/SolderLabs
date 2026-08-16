import type { SolderLabDb } from "@solderlab/db";
import { normalizeMpn } from "./types.ts";

export interface MpnUsage {
  mpn: string;
  manufacturer: string | null;
  projectIds: string[];
}

/** Head of each project's default branch plus tagged release revisions. */
export function collectOrgMpns(db: SolderLabDb, orgId: string): MpnUsage[] {
  const projects = db.projects.filter((p) => p.orgId === orgId);
  const revisionIds = new Set<string>();
  const revToProjects = new Map<string, Set<string>>();

  const addRev = (revisionId: string | null | undefined, projectId: string) => {
    if (!revisionId) return;
    revisionIds.add(revisionId);
    let set = revToProjects.get(revisionId);
    if (!set) {
      set = new Set();
      revToProjects.set(revisionId, set);
    }
    set.add(projectId);
  };

  for (const project of projects) {
    const branch = db.branches.find(
      (b) => b.projectId === project.id && b.name === project.defaultBranch,
    );
    addRev(branch?.headRevisionId, project.id);
    for (const rel of db.releases.filter((r) => r.projectId === project.id)) {
      addRev(rel.revisionId, project.id);
    }
  }

  const byMpn = new Map<string, MpnUsage>();
  for (const line of db.bomLines) {
    if (!revisionIds.has(line.revisionId)) continue;
    const mpn = line.mpn ? normalizeMpn(line.mpn) : "";
    if (!mpn) continue;
    const projectsForRev = revToProjects.get(line.revisionId);
    if (!projectsForRev) continue;
    let row = byMpn.get(mpn.toUpperCase());
    if (!row) {
      row = { mpn, manufacturer: line.manufacturer, projectIds: [] };
      byMpn.set(mpn.toUpperCase(), row);
    }
    for (const pid of projectsForRev) {
      if (!row.projectIds.includes(pid)) row.projectIds.push(pid);
    }
    if (!row.manufacturer && line.manufacturer) row.manufacturer = line.manufacturer;
  }
  return [...byMpn.values()];
}
