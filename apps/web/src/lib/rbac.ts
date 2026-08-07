import type { Role } from "@solderlab/db";
import { normalizeRole } from "@solderlab/db";

const RANK: Record<Role, number> = {
  admin: 100,
  contributor: 60,
  viewer: 20,
};

export type Action =
  | "org.manage"
  | "org.invite"
  | "project.create"
  | "revision.upload"
  | "review.open"
  | "review.comment"
  | "review.approve"
  | "review.merge"
  | "release.publish"
  | "release.download"
  | "release.share"
  | "library.manage"
  | "webhook.manage"
  | "bom.manage"
  | "view";

const ACTION_MIN: Record<Action, Role[]> = {
  "org.manage": ["admin"],
  "org.invite": ["admin"],
  "project.create": ["admin", "contributor"],
  "revision.upload": ["admin", "contributor"],
  "review.open": ["admin", "contributor"],
  "review.comment": ["admin", "contributor"],
  "review.approve": ["admin", "contributor"],
  "review.merge": ["admin", "contributor"],
  "release.publish": ["admin", "contributor"],
  "release.download": ["admin", "contributor", "viewer"],
  "release.share": ["admin", "contributor"],
  "library.manage": ["admin", "contributor"],
  "webhook.manage": ["admin"],
  "bom.manage": ["admin", "contributor"],
  view: ["admin", "contributor", "viewer"],
};

export function can(role: string, action: Action): boolean {
  const r = normalizeRole(role);
  return ACTION_MIN[action].includes(r);
}

export function roleRank(role: string) {
  return RANK[normalizeRole(role)] ?? 0;
}
